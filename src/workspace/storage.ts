import type {
  CommittedFile, LocalCommit, StagedFile, WorkspaceSnapshot, WorkingFile,
} from "./model";
import { isOwnedWorkspace, type PrincipalKey } from "./identity";
import {
  beginPushIntent,
  clearKinds,
  finishPushAtomic,
  commitStagedAtomic,
  exportLegacyQuarantine,
  forkWorkspaceAtomic,
  importLegacyQuarantine,
  listLegacyQuarantine,
  loadOwnedWorkspace,
  pendingPushIntents,
  persistWorkspace,
  readRecord,
  readRecords,
  removeRecords,
  replacePath,
  updatePushTarget,
  writeRecords,
} from "./storage-v3";
export { beginPushIntent, finishPushAtomic, pendingPushIntents, updatePushTarget, writeRecords, removeRecords } from "./storage-v3";

const OWNED_RECENT_PREFIX = "ghcode-recent-owned-v1:";

function recentKey(owner: PrincipalKey) {
  return OWNED_RECENT_PREFIX + encodeURIComponent(owner);
}

/** Every production write now targets v3 stores. The v2 stores remain read-only. */
export const saveWorkspace = persistWorkspace;
export const loadWorkspace = loadOwnedWorkspace;
export { commitStagedAtomic, exportLegacyQuarantine, importLegacyQuarantine, listLegacyQuarantine, replacePath };

export async function saveBlob(workspaceId: string, sha: string, content: string) {
  await writeRecords(workspaceId, "blob", [
    { workspaceId, sha, content, key: workspaceId + ":" + sha, updatedAt: Date.now() },
  ]);
}
export async function loadBlob(workspaceId: string, sha: string) {
  const record = await readRecord<{ content: string }>(workspaceId, "blob", sha);
  return record?.content ?? null;
}

export async function saveOverlay(file: WorkingFile) {
  await writeRecords(file.workspaceId, "overlay", [file]);
}
export async function removeOverlay(workspaceId: string, path: string) {
  await removeRecords(workspaceId, "overlay", [path]);
}
export function loadOverlays(workspaceId: string) {
  return readRecords<WorkingFile>(workspaceId, "overlay");
}

export async function saveStaged(file: StagedFile) {
  await writeRecords(file.workspaceId, "staged", [file]);
}
export async function removeStaged(workspaceId: string, path: string) {
  await removeRecords(workspaceId, "staged", [path]);
}
export function loadStaged(workspaceId: string) {
  return readRecords<StagedFile>(workspaceId, "staged");
}
export async function saveCommittedFile(file: CommittedFile) {
  await writeRecords(file.workspaceId, "committed", [file]);
}
export async function removeCommittedFile(workspaceId: string, path: string) {
  await removeRecords(workspaceId, "committed", [path]);
}
export function loadCommittedFiles(workspaceId: string) {
  return readRecords<CommittedFile>(workspaceId, "committed");
}
export async function saveLocalCommit(commit: LocalCommit) {
  await writeRecords(commit.workspaceId, "commit", [commit]);
}
export async function removeLocalCommit(id: string) {
  const workspaceId = id.split(":local:")[0];
  await removeRecords(workspaceId, "commit", [id]);
}
export async function loadLocalCommits(workspaceId: string) {
  const commits = await readRecords<LocalCommit>(workspaceId, "commit");
  return commits.sort((left, right) => left.createdAt - right.createdAt);
}
export async function clearStaged(workspaceId: string) {
  await clearKinds(workspaceId, ["staged"]);
}
export async function clearLocalGitState(workspaceId: string) {
  await clearKinds(workspaceId, ["staged", "committed", "commit"]);
}

export function loadRecentWorkspaces(owner: PrincipalKey): WorkspaceSnapshot[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(recentKey(owner)) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is WorkspaceSnapshot => isOwnedWorkspace(item, owner)).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}
export function rememberWorkspace(snapshot: WorkspaceSnapshot): WorkspaceSnapshot[] {
  const owner = snapshot.ownership?.principalKey;
  if (!owner || !isOwnedWorkspace(snapshot, owner))
    throw new Error("Unattributed legacy workspace cannot be added to owned history.");
  const recent = loadRecentWorkspaces(owner).filter((item) => item.id !== snapshot.id);
  recent.unshift(snapshot);
  localStorage.setItem(recentKey(owner), JSON.stringify(recent.slice(0, 12)));
  return recent.slice(0, 12);
}
