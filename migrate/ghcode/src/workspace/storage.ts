import type {
  CommittedFile,
  LocalCommit,
  StagedFile,
  WorkspaceSnapshot,
  WorkingFile,
} from "./model";
import { isOwnedWorkspace, isOwnedWorkspaceId, type PrincipalKey } from "./identity";

const DATABASE = "darkfactory-workbench";
const VERSION = 2;
// The original workbench-recent-workspaces-v1 is unattributed legacy and stays untouched.
const OWNED_RECENT_PREFIX = "ghcode-recent-owned-v1:";
const OWNED_PREFIX = "ghcode-owned-v2:";

// Updated synchronously before any React identity transition. Never infer authorization
// from the workspace ID supplied by a caller, an old closure, or an IDB record itself.
let activePrincipal: PrincipalKey | null = null;

export function bindStoragePrincipal(principal: PrincipalKey): void {
  activePrincipal = principal;
}

function requireOwned(id: string) {
  if (!activePrincipal || !isOwnedWorkspaceId(id) ||
      !id.startsWith(`${OWNED_PREFIX}${encodeURIComponent(activePrincipal)}:`)) {
    throw new Error("Workspace does not belong to the currently verified principal; legacy data remains quarantined.");
  }
}

function recentKey(owner: PrincipalKey) {
  return `${OWNED_RECENT_PREFIX}${encodeURIComponent(owner)}`;
}

type BlobRecord = {
  key: string;
  workspaceId: string;
  sha: string;
  content: string;
  updatedAt: number;
};
type StoreName = "workspaces" | "blobs" | "overlays" | "staged" | "committed" | "commits";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("workspaces")) {
        database.createObjectStore("workspaces", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("blobs")) {
        database.createObjectStore("blobs", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("overlays")) {
        database.createObjectStore("overlays", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("staged")) {
        database.createObjectStore("staged", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("committed")) {
        database.createObjectStore("committed", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("commits")) {
        database.createObjectStore("commits", { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(name, mode);
    // A successful IDBRequest is not proof that the transaction committed.
    // A later failure (including quota or explicit abort) must reject the API.
    const committed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
    // Attach a handler now: an abort may precede the request's error event.
    void committed.catch(() => {});
    let result: IDBRequest<T>;
    try {
      result = action(transaction.objectStore(name));
    } catch (error) {
      try { transaction.abort(); } catch { /* Already inactive. */ }
      throw error;
    }
    let value: T;
    try {
      value = await requestResult(result);
    } catch (error) {
      try { transaction.abort(); } catch { /* Already aborted. */ }
      throw error;
    }
    await committed;
    return value;
  } finally {
    database.close();
  }
}

async function allForWorkspace<T extends { workspaceId: string }>(
  name: StoreName,
  workspaceId: string,
) {
  requireOwned(workspaceId);
  const all = await withStore<T[]>(name, "readonly", (store) => store.getAll());
  return all.filter((item) => item.workspaceId === workspaceId);
}

export function saveWorkspace(snapshot: WorkspaceSnapshot) {
  requireOwned(snapshot.id);
  if (!snapshot.ownership || !activePrincipal || !isOwnedWorkspace(snapshot, activePrincipal))
    throw new Error("Refusing to overwrite unattributed legacy v2 workspace.");
  return withStore("workspaces", "readwrite", (store) => store.put(snapshot));
}

export async function loadWorkspace(id: string, owner: PrincipalKey) {
  requireOwned(id);
  if (owner !== activePrincipal) throw new Error("Storage principal changed during workspace read.");
  const snapshot = await withStore<WorkspaceSnapshot | undefined>(
    "workspaces",
    "readonly",
    (store) => store.get(id),
  );
  return isOwnedWorkspace(snapshot, owner) ? snapshot : undefined;
}

export async function saveBlob(workspaceId: string, sha: string, content: string) {
  requireOwned(workspaceId);
  const record: BlobRecord = {
    key: `${workspaceId}:${sha}`,
    workspaceId,
    sha,
    content,
    updatedAt: Date.now(),
  };
  await withStore("blobs", "readwrite", (store) => store.put(record));
}

export async function loadBlob(workspaceId: string, sha: string) {
  requireOwned(workspaceId);
  const record = await withStore<BlobRecord | undefined>("blobs", "readonly", (store) =>
    store.get(`${workspaceId}:${sha}`),
  );
  return record?.content ?? null;
}

export async function saveOverlay(file: WorkingFile) {
  requireOwned(file.workspaceId);
  await withStore("overlays", "readwrite", (store) => store.put(file));
}

export async function removeOverlay(workspaceId: string, path: string) {
  requireOwned(workspaceId);
  await withStore("overlays", "readwrite", (store) => store.delete(`${workspaceId}:${path}`));
}

export function loadOverlays(workspaceId: string) {
  return allForWorkspace<WorkingFile>("overlays", workspaceId);
}

export async function saveStaged(file: StagedFile) {
  requireOwned(file.workspaceId);
  await withStore("staged", "readwrite", (store) => store.put(file));
}

export async function removeStaged(workspaceId: string, path: string) {
  requireOwned(workspaceId);
  await withStore("staged", "readwrite", (store) => store.delete(`${workspaceId}:${path}`));
}

export function loadStaged(workspaceId: string) {
  return allForWorkspace<StagedFile>("staged", workspaceId);
}

export async function saveCommittedFile(file: CommittedFile) {
  requireOwned(file.workspaceId);
  await withStore("committed", "readwrite", (store) => store.put(file));
}

export async function removeCommittedFile(workspaceId: string, path: string) {
  requireOwned(workspaceId);
  await withStore("committed", "readwrite", (store) => store.delete(`${workspaceId}:${path}`));
}

export function loadCommittedFiles(workspaceId: string) {
  return allForWorkspace<CommittedFile>("committed", workspaceId);
}

export async function saveLocalCommit(commit: LocalCommit) {
  requireOwned(commit.workspaceId);
  await withStore("commits", "readwrite", (store) => store.put(commit));
}

export async function removeLocalCommit(id: string) {
  requireOwned(id.split(":local:")[0]);
  await withStore("commits", "readwrite", (store) => store.delete(id));
}

export async function loadLocalCommits(workspaceId: string) {
  const commits = await allForWorkspace<LocalCommit>("commits", workspaceId);
  return commits.sort((left, right) => left.createdAt - right.createdAt);
}

async function clearStoreForWorkspace<T extends { key?: string; id?: string; workspaceId: string }>(
  name: StoreName,
  workspaceId: string,
) {
  const items = await allForWorkspace<T>(name, workspaceId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(name, "readwrite");
    const store = transaction.objectStore(name);
    for (const item of items) {
      const key = item.key ?? item.id;
      if (key) store.delete(key);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    database.close();
  }
}


function sameStaged(left: StagedFile, right: StagedFile) {
  return left.workspaceId === right.workspaceId &&
    left.key === right.key &&
    left.path === right.path &&
    left.status === right.status &&
    left.content === right.content &&
    left.baseSha === right.baseSha &&
    left.renamedFrom === right.renamedFrom &&
    left.stagedAt === right.stagedAt &&
    left.updatedAt === right.updatedAt;
}

function sameWorking(left: WorkingFile, right: WorkingFile) {
  return left.path === right.path && left.status === right.status &&
    left.content === right.content && left.baseSha === right.baseSha &&
    left.renamedFrom === right.renamedFrom;
}

/**
 * A single IndexedDB transaction owns the entire local-commit transition:
 * committed-file state, durable commit, staged removals, and overlay reconciliation.
 * Stale staged inputs abort instead of committing an incomplete snapshot.
 * Other principals' records and unattributed v2 records are never mutated.
 */
export async function commitLocalChanges(commit: LocalCommit, expectedStaged: StagedFile[]) {
  requireOwned(commit.workspaceId);
  if (!expectedStaged.length || expectedStaged.length !== commit.files.length ||
      !commit.id.startsWith(`${commit.workspaceId}:local:`)) {
    throw new Error("Invalid local commit or empty staged snapshot.");
  }
  const keys = new Set<string>();
  for (const file of expectedStaged) {
    requireOwned(file.workspaceId);
    if (file.workspaceId !== commit.workspaceId ||
        file.key !== `${commit.workspaceId}:${file.path}` || keys.has(file.key)) {
      throw new Error("Invalid staged ownership, key, or duplicate path.");
    }
    keys.add(file.key);
    const matching = commit.files.find(candidate => candidate.key === file.key);
    if (!matching || !sameWorking(matching, file)) {
      throw new Error("Local commit does not match staged files.");
    }
  }
  const db = await openDatabase();
  try {
    requireOwned(commit.workspaceId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["staged", "overlays", "committed", "commits"], "readwrite");
      let abortReason: Error | null = null;
      const abortWith = (error: Error) => {
        abortReason = error;
        try { tx.abort(); } catch { reject(error); }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(abortReason ?? tx.error ?? new Error("Local commit transaction aborted"));
      tx.onerror = () => reject(abortReason ?? tx.error ?? new Error("Local commit transaction failed"));
      const stagedRequest = tx.objectStore("staged").getAll();
      const overlaysRequest = tx.objectStore("overlays").getAll();
      let storedStaged: StagedFile[] | null = null;
      let storedOverlays: WorkingFile[] | null = null;
      const apply = () => {
        if (!storedStaged || !storedOverlays) return;
        try {
          requireOwned(commit.workspaceId);
          const current = storedStaged.filter(file => file.workspaceId === commit.workspaceId);
          if (current.length !== expectedStaged.length ||
              expectedStaged.some(file => !current.some(actual => sameStaged(actual, file)))) {
            throw new Error("Staged state changed concurrently; reload before committing.");
          }
          const overlayStore = tx.objectStore("overlays");
          const stagedStore = tx.objectStore("staged");
          const committedStore = tx.objectStore("committed");
          const now = Date.now();
          for (const file of expectedStaged) {
            committedStore.put({
              key: file.key, workspaceId: commit.workspaceId, path: file.path,
              content: file.status === "deleted" ? undefined : file.content,
              deleted: file.status === "deleted", baseSha: file.baseSha, updatedAt: now,
            } satisfies CommittedFile);
            stagedStore.delete(file.key);
            const overlay = storedOverlays.find(candidate =>
              candidate.workspaceId === commit.workspaceId && candidate.key === file.key);
            if (overlay && sameWorking(overlay, file)) {
              overlayStore.delete(file.key);
            } else if (overlay && file.status !== "deleted" &&
                       (overlay.status === "added" || overlay.status === "renamed")) {
              overlayStore.put({
                ...overlay, status: "modified", renamedFrom: undefined, updatedAt: now,
              } satisfies WorkingFile);
            }
          }
          // add(), not put(): an operation ID is immutable and cannot overwrite a prior commit.
          tx.objectStore("commits").add(commit);
        } catch (reason) {
          abortWith(reason instanceof Error ? reason : new Error(String(reason)));
        }
      };
      stagedRequest.onsuccess = () => { storedStaged = stagedRequest.result as StagedFile[]; apply(); };
      overlaysRequest.onsuccess = () => { storedOverlays = overlaysRequest.result as WorkingFile[]; apply(); };
    });
  } finally {
    db.close();
  }
}

export async function clearStaged(workspaceId: string) {
  await clearStoreForWorkspace<StagedFile>("staged", workspaceId);
}

/** Clear the complete local Git state in one atomic transaction after confirmed remote push. */
export async function clearLocalGitState(workspaceId: string) {
  requireOwned(workspaceId);
  const db = await openDatabase();
  try {
    requireOwned(workspaceId);
    await new Promise<void>((resolve, reject) => {
      const names: Array<"staged" | "committed" | "commits"> = ["staged", "committed", "commits"];
      const tx = db.transaction(names, "readwrite");
      let abortReason: Error | null = null;
      const abortWith = (reason: Error) => {
        abortReason = reason;
        try { tx.abort(); } catch { reject(reason); }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(abortReason ?? tx.error ?? new Error("Git state cleanup aborted"));
      tx.onerror = () => reject(abortReason ?? tx.error ?? new Error("Git state cleanup failed"));
      for (const name of names) {
        const store = tx.objectStore(name);
        const request = store.getAll();
        request.onsuccess = () => {
          try {
            requireOwned(workspaceId);
            for (const item of request.result as Array<{ workspaceId: string; key?: string; id?: string }>) {
              if (item.workspaceId !== workspaceId) continue;
              const key = item.key ?? item.id;
              if (!key || !key.startsWith(`${workspaceId}:`)) {
                throw new Error("Corrupt Git state key; refusing destructive cleanup.");
              }
              store.delete(key);
            }
          } catch (reason) {
            abortWith(reason instanceof Error ? reason : new Error(String(reason)));
          }
        };
      }
    });
  } finally {
    db.close();
  }
}

export function loadRecentWorkspaces(owner: PrincipalKey): WorkspaceSnapshot[] {
  if (!activePrincipal || owner !== activePrincipal) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(recentKey(owner)) || "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is WorkspaceSnapshot => isOwnedWorkspace(item, owner))
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function rememberWorkspace(snapshot: WorkspaceSnapshot): WorkspaceSnapshot[] {
  const owner = snapshot.ownership?.principalKey;
  if (!owner || owner !== activePrincipal || !isOwnedWorkspace(snapshot, owner))
    throw new Error("Unattributed legacy workspace must not be added to owned recent history.");
  const recent = loadRecentWorkspaces(owner).filter((item) => item.id !== snapshot.id);
  recent.unshift(snapshot);
  localStorage.setItem(recentKey(owner), JSON.stringify(recent.slice(0, 12)));
  return recent.slice(0, 12);
}
