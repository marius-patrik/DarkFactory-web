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

export async function clearStaged(workspaceId: string) {
  await clearStoreForWorkspace<StagedFile>("staged", workspaceId);
}

export async function clearLocalGitState(workspaceId: string) {
  await Promise.all([
    clearStoreForWorkspace<StagedFile>("staged", workspaceId),
    clearStoreForWorkspace<CommittedFile>("committed", workspaceId),
    clearStoreForWorkspace<LocalCommit>("commits", workspaceId),
  ]);
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
