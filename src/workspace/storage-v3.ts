import { isOwnedWorkspace, isOwnedWorkspaceId, type PrincipalKey } from "./identity";
import type {
  CommittedFile,
  LocalCommit,
  StagedFile,
  WorkingFile,
  WorkspaceSnapshot,
} from "./model";

/**
 * GHCode v3: the six unprefixed stores are historical evidence, not live storage.
 * New writes are scoped by the immutable owned session and acknowledged on tx.complete.
 */
const DATABASE = "darkfactory-workbench";
export const STORAGE_VERSION = 3;
const LEGACY = ["workspaces", "blobs", "overlays", "staged", "committed", "commits"] as const;
export type RecordKind = "blob" | "overlay" | "staged" | "committed" | "commit";
export type PersistedRecord<T = unknown> = {
  id: string;
  sessionId: string;
  principalKey: PrincipalKey;
  kind: RecordKind;
  name: string;
  value: T;
  resourceId?: string;
  revisionId?: string;
};
export type Session = {
  id: string;
  principalKey: PrincipalKey;
  workspaceId: string;
  repositoryKey: string;
  gitRef: string;
  revision: number;
  snapshot: WorkspaceSnapshot;
};
export type LegacyRecord = {
  id: string;
  source: string;
  originalKey: IDBValidKey | string;
  value: unknown;
};
export class StorageConflictError extends Error {
  constructor(message = "Concurrent workspace update detected. Your local work was not committed.") {
    super(message);
    this.name = "StorageConflictError";
  }
}

const revisionCache = new Map<string, number>();
const invalidated = new Set<string>();
const queues = new Map<string, Promise<unknown>>();
let capturedLocal = false;
let captureFlight: Promise<void> | undefined;
let channel: BroadcastChannel | undefined;
function storageChannel() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("ghcode-persistence-v3");
    channel.onmessage = (event: MessageEvent<{ session?: string; revision?: number }>) => {
      const { session, revision } = event.data ?? {};
      if (typeof session === "string" && typeof revision === "number" &&
          revisionCache.has(session) && revision > (revisionCache.get(session) ?? -1))
        invalidated.add(session);
    };
  }
  return channel;
}
function noteRevision(id: string, revision: number) {
  revisionCache.set(id, revision);
  invalidated.delete(id);
  storageChannel()?.postMessage({ session: id, revision });
}
function keyFor(sessionId: string, kind: RecordKind, name: string) {
  return JSON.stringify([sessionId, kind, name]);
}
function validateSession(snapshot: WorkspaceSnapshot): asserts snapshot is WorkspaceSnapshot & {
  ownership: NonNullable<WorkspaceSnapshot["ownership"]>;
} {
  if (!snapshot.ownership ||
      !isOwnedWorkspace(snapshot, snapshot.ownership.principalKey))
    throw new Error("Refusing to persist an unattributed workspace.");
}

export function openV3(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, STORAGE_VERSION);
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("IndexedDB v3 upgrade blocked by another tab. Close older GHCode tabs and retry."));
    };
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) throw new Error("IndexedDB upgrade transaction unavailable.");
      // Preserve all old stores. The quarantine stores independent structured clones.
      for (const name of LEGACY) {
        if (!db.objectStoreNames.contains(name))
          db.createObjectStore(name, { keyPath: name === "workspaces" || name === "commits" ? "id" : "key" });
      }
      if (!db.objectStoreNames.contains("v3_sessions")) {
        const store = db.createObjectStore("v3_sessions", { keyPath: "id" });
        store.createIndex("byPrincipal", "principalKey");
        store.createIndex("byWorkspace", ["principalKey", "workspaceId"]);
        store.createIndex("byRepository", ["principalKey", "repositoryKey"]);
      }
      if (!db.objectStoreNames.contains("v3_records")) {
        const store = db.createObjectStore("v3_records", { keyPath: "id" });
        store.createIndex("bySessionKind", ["sessionId", "kind"]);
        store.createIndex("byPrincipal", "principalKey");
      }
      if (!db.objectStoreNames.contains("v3_revisions"))
        db.createObjectStore("v3_revisions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("v3_legacy")) {
        const store = db.createObjectStore("v3_legacy", { keyPath: "id" });
        store.createIndex("bySource", "source");
      }
      if (!db.objectStoreNames.contains("v3_manifests"))
        db.createObjectStore("v3_manifests", { keyPath: "id" });
      if (!db.objectStoreNames.contains("v3_push_ops"))
        db.createObjectStore("v3_push_ops", { keyPath: "id" });

      if (event.oldVersion < 3) {
        const quarantine = tx.objectStore("v3_legacy");
        for (const name of LEGACY) {
          const cursor = tx.objectStore(name).openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            quarantine.put({
              id: "idb:" + name + ":" + JSON.stringify(row.primaryKey),
              source: "idb:" + name,
              originalKey: row.primaryKey,
              value: row.value,
            } satisfies LegacyRecord);
            row.continue();
          };
        }
        tx.objectStore("v3_manifests").put({
          id: "idb-v2-quarantine",
          state: "complete-in-upgrade-transaction",
          sourceVersion: event.oldVersion,
          capturedAt: Date.now(),
        });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB v3 open failed."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) { db.close(); return; }
      resolve(db);
    };
  });
}

function complete<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  schedule: (tx: IDBTransaction, set: (value: T) => void, fail: (error: unknown) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result!: T;
    let failure: Error | undefined;
    let tx: IDBTransaction;
    try { tx = db.transaction(stores, mode); }
    catch (error) { reject(error); return; }
    const fail = (error: unknown) => {
      failure = error instanceof Error ? error : new Error(String(error));
      try { tx.abort(); } catch {}
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error("IndexedDB transaction aborted."));
    tx.onerror = () => { /* onabort propagates the final failure */ };
    try { schedule(tx, (value) => { result = value; }, fail); }
    catch (error) { fail(error); }
  });
}

async function captureLegacyLocal(db: IDBDatabase) {
  if (capturedLocal) return;
  if (captureFlight) return captureFlight;
  captureFlight = (async () => {
    // Read before opening a transaction. Never swallow an inaccessible-storage error.
    const keys = ["workbench-recent-workspaces-v1", "workbench-layout-v1", "workbench-layout-v2"];
    const records = keys.map((key) => ({ key, value: localStorage.getItem(key) }));
    await complete<void>(
      db, ["v3_legacy", "v3_manifests"], "readwrite",
      (tx, set) => {
        const legacy = tx.objectStore("v3_legacy");
        for (const record of records) {
          if (record.value !== null)
            legacy.put({
              id: "local:" + record.key, source: "localStorage",
              originalKey: record.key, value: record.value,
            });
        }
        tx.objectStore("v3_manifests").put({
          id: "localStorage-v1-v2", state: "complete",
          keys: records.filter((record) => record.value !== null).map((record) => record.key),
        });
        set(undefined);
      },
    );
    capturedLocal = true;
  })();
  try { await captureFlight; }
  finally { captureFlight = undefined; }
}
async function dbOperation<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openV3();
  try {
    await captureLegacyLocal(db);
    return await work(db);
  } finally { db.close(); }
}
function get<T>(db: IDBDatabase, storeName: string, id: IDBValidKey): Promise<T | undefined> {
  return complete(db, [storeName], "readonly", (tx, set) => {
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => set(request.result as T | undefined);
  });
}
function all<T>(db: IDBDatabase, storeName: string, index?: string, query?: IDBValidKey | IDBKeyRange) {
  return complete<T[]>(db, [storeName], "readonly", (tx, set) => {
    const store = tx.objectStore(storeName);
    const request = index ? store.index(index).getAll(query) : store.getAll(query);
    request.onsuccess = () => set(request.result as T[]);
  });
}
export function readSession(id: string, owner?: PrincipalKey) {
  return dbOperation(async (db) => {
    const session = await get<Session>(db, "v3_sessions", id);
    if (session && (!owner || session.principalKey === owner)) {
      if (!revisionCache.has(id)) revisionCache.set(id, session.revision);
      storageChannel();
      return session;
    }
    return undefined;
  });
}
export async function loadOwnedWorkspace(id: string, owner: PrincipalKey) {
  if (!isOwnedWorkspaceId(id)) return undefined;
  const existing = await readSession(id, owner);
  if (existing) return existing.snapshot;
  return importOwnedV2(id, owner);
}

async function importOwnedV2(id: string, owner: PrincipalKey) {
  return dbOperation(async (db) => {
    const snapshot = await get<WorkspaceSnapshot>(db, "workspaces", id);
    if (!isOwnedWorkspace(snapshot, owner)) return undefined;
    const sources = await Promise.all(
      (["blobs", "overlays", "staged", "committed", "commits"] as const).map(async (name) => ({
        name,
        rows: (await all<{ workspaceId?: string; key?: string; id?: string; path?: string; sha?: string }>(
          db, name)).filter((row) => row.workspaceId === id),
      })),
    );
    const session = sessionFromSnapshot(snapshot);
    const result = await complete<boolean>(
      db, ["v3_sessions", "v3_records", "v3_revisions", "v3_manifests"], "readwrite",
      (tx, set, fail) => {
        const store = tx.objectStore("v3_sessions");
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) { set(false); return; }
          try {
            store.add(session);
            const records = tx.objectStore("v3_records");
            const revisions = tx.objectStore("v3_revisions");
            for (const source of sources) for (const row of source.rows) {
              const kind = source.name === "blobs" ? "blob"
                : source.name === "commits" ? "commit" : source.name === "overlays" ? "overlay"
                : source.name === "staged" ? "staged" : "committed";
              const name = kind === "blob" ? String(row.sha ?? row.key) :
                kind === "commit" ? String(row.id) : String(row.path);
              const revId = kind === "staged" ? crypto.randomUUID() : undefined;
              records.add({
                id: keyFor(id, kind, name), sessionId: id, principalKey: owner,
                kind, name, value: row,
                resourceId: crypto.randomUUID(), revisionId: revId,
              });
              if (revId) revisions.add({
                id: revId, sessionId: id, principalKey: owner, kind, value: row,
              });
            }
            tx.objectStore("v3_manifests").put({
              id: "owned-v2:" + id, state: "complete", principalKey: owner,
              sourceCounts: sources.map((source) => [source.name, source.rows.length]),
            });
            set(true);
          } catch (error) { fail(error); }
        };
      },
    );
    if (result) noteRevision(id, 0);
    else if (!revisionCache.has(id)) {
      const persisted = await get<Session>(db, "v3_sessions", id);
      if (persisted) revisionCache.set(id, persisted.revision);
    }
    return snapshot;
  });
}
function sessionFromSnapshot(snapshot: WorkspaceSnapshot): Session {
  validateSession(snapshot);
  const ownership = snapshot.ownership;
  return {
    id: snapshot.id,
    principalKey: ownership.principalKey,
    workspaceId: ownership.workspace.id,
    repositoryKey: ownership.session.repositoryKey,
    gitRef: ownership.session.ref,
    revision: 0,
    snapshot,
  };
}
export async function persistWorkspace(snapshot: WorkspaceSnapshot) {
  validateSession(snapshot);
  // A previously scoped v2 session must be copied before any v3 snapshot update,
  // otherwise its staged work and local commits would become unreachable.
  await loadOwnedWorkspace(snapshot.id, snapshot.ownership.principalKey);
  const existing = await readSession(snapshot.id, snapshot.ownership.principalKey);
  if (existing) {
    await mutate(snapshot.id, (_tx, session, done) => {
      const identity = sessionFromSnapshot(snapshot);
      if (identity.repositoryKey !== session.repositoryKey ||
          identity.workspaceId !== session.workspaceId ||
          identity.principalKey !== session.principalKey ||
          identity.gitRef !== session.gitRef)
        throw new StorageConflictError("Immutable repository-session identity changed.");
      done({ session: { ...session, snapshot } });
    });
    return;
  }
  await dbOperation(async (db) => {
    const session = sessionFromSnapshot(snapshot);
    await complete<void>(db, ["v3_sessions"], "readwrite", (tx, set, fail) => {
      const req = tx.objectStore("v3_sessions").add(session);
      req.onerror = () => { /* transaction aborts automatically */ };
      set(undefined);
    });
    noteRevision(snapshot.id, 0);
  });
}
type MutationResult<T> = { session?: Session; value?: T };
function exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request)
    return locks.request("ghcode-v3:" + id, { mode: "exclusive" }, action);
  const previous = queues.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  queues.set(id, next);
  void next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
  return next;
}
export function mutate<T = void>(
  id: string,
  operation: (
    tx: IDBTransaction, session: Session,
    done: (result?: MutationResult<T>) => void,
    fail: (reason: unknown) => void,
  ) => void,
): Promise<T> {
  return exclusive(id, () => dbOperation(async (db) => {
    let expected = revisionCache.get(id);
    if (invalidated.has(id)) throw new StorageConflictError();
    if (expected === undefined) {
      // Existing tabs hydrate this cache while loading a workspace. Do not silently
      // pick up a newer revision if the tab has already cached one.
      const original = await get<Session>(db, "v3_sessions", id);
      if (!original) throw new Error("Workspace session no longer exists.");
      expected = original.revision;
      revisionCache.set(id, expected);
    }
    const value = await complete<{ value: T; revision: number }>(
      db, ["v3_sessions", "v3_records", "v3_revisions", "v3_push_ops"], "readwrite",
      (tx, set, fail) => {
        const request = tx.objectStore("v3_sessions").get(id);
        request.onsuccess = () => {
          const current = request.result as Session | undefined;
          if (!current) { fail(new Error("Missing workspace session.")); return; }
          if (current.revision !== expected || current.principalKey !== current.snapshot.ownership?.principalKey) {
            fail(new StorageConflictError()); return;
          }
          let finished = false;
          try {
            operation(tx, current, (result = {}) => {
              if (finished) { fail(new Error("Mutation completed more than once.")); return; }
              finished = true;
              const next = result.session ?? current;
              if (next.id !== id || next.principalKey !== current.principalKey ||
                  next.workspaceId !== current.workspaceId || next.repositoryKey !== current.repositoryKey ||
                  next.gitRef !== current.gitRef)
                throw new StorageConflictError("Repository session owner or identity cannot change.");
              const revision = current.revision + 1;
              tx.objectStore("v3_sessions").put({ ...next, revision });
              set({ value: result.value as T, revision });
            }, fail);
          } catch (error) { fail(error); }
        };
      },
    );
    noteRevision(id, value.revision);
    return value.value;
  }));
}
function putRecord<T>(tx: IDBTransaction, session: Session, kind: RecordKind, name: string, value: T, revisionId?: string, resourceId?: string) {
  tx.objectStore("v3_records").put({
    id: keyFor(session.id, kind, name), sessionId: session.id,
    principalKey: session.principalKey, kind, name, value,
    revisionId, resourceId,
  } satisfies PersistedRecord<T>);
}
export function writeRecords<T extends { workspaceId: string; path?: string; sha?: string; id?: string }>(
  sessionId: string, kind: RecordKind, rows: T[],
) {
  for (const row of rows) if (row.workspaceId !== sessionId)
    throw new Error("Cross-session record write rejected.");
  return mutate(sessionId, (tx, session, done) => {
    for (const row of rows) {
      const name = kind === "blob" ? String(row.sha) : kind === "commit" ? String(row.id) : String(row.path);
      const revisionId = kind === "staged" ? crypto.randomUUID() : undefined;
      putRecord(tx, session, kind, name, structuredClone(row), revisionId);
      if (revisionId) tx.objectStore("v3_revisions").add({
        id: revisionId, sessionId, principalKey: session.principalKey,
        kind, value: structuredClone(row),
      });
    }
    done();
  });
}
export function removeRecords(sessionId: string, kind: RecordKind, paths: string[]) {
  return mutate(sessionId, (tx, _session, done) => {
    for (const path of paths) tx.objectStore("v3_records").delete(keyFor(sessionId, kind, path));
    done();
  });
}
export async function readRecords<T>(sessionId: string, kind: RecordKind): Promise<T[]> {
  const session = await readSession(sessionId);
  if (!session) throw new Error("Workspace session is not accessible.");
  return dbOperation(async (db) => {
    const records = await all<PersistedRecord<T>>(
      db, "v3_records", "bySessionKind", IDBKeyRange.only([sessionId, kind]));
    if (records.some((record) => record.principalKey !== session.principalKey))
      throw new Error("Corrupt cross-principal storage record.");
    return records.map((record) => record.value);
  });
}
export async function readRecord<T>(id: string, kind: RecordKind, name: string) {
  const session = await readSession(id);
  if (!session) throw new Error("Workspace session is not accessible.");
  return dbOperation(async (db) => {
    const record = await get<PersistedRecord<T>>(db, "v3_records", keyFor(id, kind, name));
    if (record && record.principalKey !== session.principalKey)
      throw new Error("Corrupt cross-principal storage record.");
    return record?.value;
  });
}
export function replacePath(
  sessionId: string,
  remove: Array<{ kind: RecordKind; name: string }>,
  put: Array<{ kind: RecordKind; name: string; value: WorkingFile | StagedFile }>,
) {
  return mutate(sessionId, (tx, session, done) => {
    for (const row of put) if (row.value.workspaceId !== sessionId)
      throw new Error("Cross-session rename rejected.");
    for (const row of remove) tx.objectStore("v3_records").delete(keyFor(sessionId, row.kind, row.name));
    for (const row of put) putRecord(tx, session, row.kind, row.name, structuredClone(row.value));
    done();
  });
}
export function commitStagedAtomic(id: string, message: string): Promise<LocalCommit> {
  const normalized = message.trim();
  if (!normalized) return Promise.reject(new Error("Commit message cannot be empty."));
  return mutate<LocalCommit>(id, (tx, session, done, fail) => {
    const index = tx.objectStore("v3_records").index("bySessionKind");
    const stagedReq = index.getAll(IDBKeyRange.only([id, "staged"]));
    stagedReq.onsuccess = () => {
      const staged = (stagedReq.result as PersistedRecord<StagedFile>[])
        .map((record) => record.value);
      if (!staged.length) { fail(new Error("No staged files.")); return; }
      const overlayReq = index.getAll(IDBKeyRange.only([id, "overlay"]));
      overlayReq.onsuccess = () => {
        const working = new Map(
          (overlayReq.result as PersistedRecord<WorkingFile>[]).map((row) => [row.name, row.value]));
        const now = Date.now();
        const commit: LocalCommit = {
          id: id + ":local:" + now + ":" + crypto.randomUUID(),
          workspaceId: id, message: normalized, createdAt: now,
          files: staged.map(({ stagedAt: _stagedAt, ...file }) => structuredClone(file)),
        };
        try {
          for (const file of staged) {
            const projection: CommittedFile = {
              key: id + ":" + file.path, workspaceId: id, path: file.path,
              content: file.status === "deleted" ? undefined : file.content,
              deleted: file.status === "deleted", baseSha: file.baseSha, updatedAt: now,
            };
            putRecord(tx, session, "committed", file.path, projection);
            const current = working.get(file.path);
            if (current && current.path === file.path && current.status === file.status &&
                current.content === file.content && current.baseSha === file.baseSha &&
                current.renamedFrom === file.renamedFrom) {
              tx.objectStore("v3_records").delete(keyFor(id, "overlay", file.path));
            } else if (current && file.status !== "deleted" &&
                (current.status === "added" || current.status === "renamed")) {
              putRecord(tx, session, "overlay", file.path, {
                ...current, status: "modified", renamedFrom: undefined, updatedAt: now,
              });
            }
            tx.objectStore("v3_records").delete(keyFor(id, "staged", file.path));
          }
          putRecord(tx, session, "commit", commit.id, commit);
          done({ value: commit });
        } catch (error) { fail(error); }
      };
    };
  });
}
export function clearKinds(id: string, kinds: RecordKind[]) {
  return mutate(id, (tx, _session, done) => {
    const index = tx.objectStore("v3_records").index("bySessionKind");
    let pending = kinds.length;
    if (!pending) { done(); return; }
    for (const kind of kinds) {
      const request = index.getAllKeys(IDBKeyRange.only([id, kind]));
      request.onsuccess = () => {
        for (const key of request.result) tx.objectStore("v3_records").delete(key);
        pending--;
        if (!pending) done();
      };
    }
  });
}

/** Copy a newly created branch session in one IDB transaction; source stays untouched. */
export async function forkWorkspaceAtomic(fromId: string, target: WorkspaceSnapshot) {
  validateSession(target);
  if (fromId === target.id) throw new StorageConflictError("Branch must have a separate session.");
  const source = await readSession(fromId);
  if (!source || source.principalKey !== target.ownership.principalKey)
    throw new StorageConflictError("Cannot fork a workspace owned by another principal.");
  return exclusive(fromId, () => dbOperation(async (db) => {
    const expected = revisionCache.get(fromId);
    if (expected === undefined || invalidated.has(fromId))
      throw new StorageConflictError();
    await complete<void>(
      db, ["v3_sessions", "v3_records", "v3_revisions"], "readwrite",
      (tx, set, fail) => {
        const sessions = tx.objectStore("v3_sessions");
        const readSource = sessions.get(fromId);
        readSource.onsuccess = () => {
          const current = readSource.result as Session | undefined;
          if (!current || current.revision !== expected ||
              current.principalKey !== target.ownership.principalKey) {
            fail(new StorageConflictError()); return;
          }
          const recordStore = tx.objectStore("v3_records");
          const readRows = recordStore.index("byPrincipal").getAll(current.principalKey);
          readRows.onsuccess = () => {
            try {
              const rows = (readRows.result as PersistedRecord[])
                .filter((row) => row.sessionId === fromId);
              const next = sessionFromSnapshot(target);
              sessions.add(next);
              const revisions = tx.objectStore("v3_revisions");
              for (const original of rows) {
                const kind = original.kind;
                const value = structuredClone(original.value) as Record<string, unknown>;
                value.workspaceId = target.id;
                if (typeof value.key === "string" && kind !== "commit")
                  value.key = target.id + ":" + String(original.name);
                if (kind === "commit") {
                  value.id = target.id + ":local:" + String(value.createdAt) + ":" + crypto.randomUUID();
                  const files = Array.isArray(value.files) ? value.files : [];
                  value.files = files.map((item) => ({
                    ...item, workspaceId: target.id, key: target.id + ":" + String(item.path),
                  }));
                }
                const name = kind === "commit" ? String(value.id) : original.name;
                const revisionId = kind === "staged" ? crypto.randomUUID() : undefined;
                recordStore.add({
                  id: keyFor(target.id, kind, name), sessionId: target.id,
                  principalKey: next.principalKey, kind, name, value,
                  resourceId: crypto.randomUUID(), revisionId,
                });
                if (revisionId) revisions.add({
                  id: revisionId, sessionId: target.id,
                  principalKey: next.principalKey, kind, value: structuredClone(value),
                });
              }
              set(undefined);
            } catch (reason) { fail(reason); }
          };
        };
      },
    );
    noteRevision(target.id, 0);
  }));
}

export async function listLegacyQuarantine(): Promise<LegacyRecord[]> {
  return dbOperation((db) => all<LegacyRecord>(db, "v3_legacy"));
}
export async function exportLegacyQuarantine(): Promise<string> {
  const records = await listLegacyQuarantine();
  return JSON.stringify({
    format: "ghcode-legacy-recovery", version: 1, exportedAt: new Date().toISOString(),
    records,
  }, null, 2);
}
export async function importLegacyQuarantine(archive: string): Promise<number> {
  const parsed: unknown = JSON.parse(archive);
  if (!parsed || typeof parsed !== "object" ||
      !("format" in parsed) || parsed.format !== "ghcode-legacy-recovery" ||
      !("version" in parsed) || parsed.version !== 1 ||
      !("records" in parsed) || !Array.isArray(parsed.records))
    throw new Error("Not a GHCode legacy recovery archive.");
  const rows = parsed.records as LegacyRecord[];
  if (rows.length > 200000) throw new Error("Recovery archive exceeds record limit.");
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || typeof row.source !== "string" ||
        !("value" in row) || !("originalKey" in row))
      throw new Error("Invalid legacy recovery record.");
  }
  return dbOperation((db) => complete<number>(
    db, ["v3_legacy"], "readwrite", (tx, set, fail) => {
      const store = tx.objectStore("v3_legacy");
      let pending = rows.length;
      if (!pending) { set(0); return; }
      for (const row of rows) {
        const lookup = store.get(row.id);
        lookup.onsuccess = () => {
          if (lookup.result) {
            // Never replace an existing quarantined copy.
            if (JSON.stringify(lookup.result) !== JSON.stringify(row)) {
              fail(new StorageConflictError("Recovery archive conflicts with preserved historical data."));
              return;
            }
          } else store.add(structuredClone(row));
          if (!--pending) set(rows.length);
        };
      }
    },
  ));
}
export function clearLocalRevisionCacheForTesting() {
  revisionCache.clear();
  invalidated.clear();
}
