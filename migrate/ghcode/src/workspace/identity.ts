import type { GithubRef, GithubRepository } from "@/github/client";
import type { WorkspaceSnapshot } from "./model";

/** GitHub identities are immutable numeric provider IDs, never account login strings. */
export type PrincipalKey = `gh:github.com:${number}` | `anon:${string}`;
export type GithubPrincipal = {
  kind: "github";
  key: `gh:github.com:${number}`;
  userId: number;
};
export type AnonymousPrincipal = {
  kind: "anonymous";
  key: `anon:${string}`;
  profileId: string;
};
export type Principal = GithubPrincipal | AnonymousPrincipal;
export type RepositoryKey = `gh:github.com:repo:${number}`;
export type GitRef = `refs/heads/${string}` | `refs/tags/${string}` | `sha:${string}`;
export type RepositoryIdentity = { key: RepositoryKey; id: number; fullName: string };
export type WorkspaceIdentity = { id: string; principalKey: PrincipalKey };
export type RepositorySessionIdentity = {
  id: string;
  principalKey: PrincipalKey;
  workspaceId: string;
  repositoryKey: RepositoryKey;
  ref: GitRef;
};
export type ResourceIdentity = {
  principalKey: PrincipalKey;
  sessionId: string;
  resourceId: string;
  kind: "document" | "blob" | "overlay" | "staged" | "commit" | "layout";
};
export type OwnershipGeneration = { principalKey: PrincipalKey; generation: number };
export type OwnedWorkspaceIdentity = {
  principalKey: PrincipalKey;
  workspace: WorkspaceIdentity;
  session: RepositorySessionIdentity;
};

const PROFILE_KEY = "ghcode-anonymous-profile-v1";
const OWNED_PREFIX = "ghcode-owned-v2:";

/** The anonymous profile is explicit, stable and independent of GitHub login. */
export function anonymousPrincipal(): AnonymousPrincipal {
  let id: string | null = null;
  try {
    id = localStorage.getItem(PROFILE_KEY);
  } catch {}
  if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(PROFILE_KEY, id);
    } catch {
      // Without storage the profile is session-only, but never takes another profile's identity.
    }
  }
  return { kind: "anonymous", profileId: id, key: `anon:${id}` };
}

export function githubPrincipal(id: number): GithubPrincipal {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("GitHub /user has no valid numeric ID.");
  return { kind: "github", userId: id, key: `gh:github.com:${id}` };
}

export function repositoryIdentity(repository: GithubRepository): RepositoryIdentity {
  if (!Number.isSafeInteger(repository.id) || repository.id <= 0)
    throw new Error("Repository is missing a valid immutable GitHub ID.");
  return {
    key: `gh:github.com:repo:${repository.id}`,
    id: repository.id,
    fullName: repository.full_name,
  };
}

export function canonicalGitRef(name: string, refs: GithubRef[]): GitRef {
  if (/^refs\/(heads|tags)\/.+/.test(name)) return name as GitRef;
  if (/^[0-9a-f]{40}$/i.test(name)) return `sha:${name.toLowerCase()}`;
  if (!name || name.startsWith("refs/")) throw new Error("Unsupported Git ref.");
  const options = refs.filter((ref) => ref.name === name);
  if (options.length > 1) throw new Error("Ambiguous branch/tag name. Select an explicit Git ref.");
  return options[0]?.kind === "tag" ? `refs/tags/${name}` : `refs/heads/${name}`;
}

export function createOwnedWorkspaceIdentity(
  principal: Principal,
  repository: RepositoryIdentity,
  ref: GitRef,
): OwnedWorkspaceIdentity {
  const workspace: WorkspaceIdentity = { id: crypto.randomUUID(), principalKey: principal.key };
  const session: RepositorySessionIdentity = {
    id: crypto.randomUUID(),
    principalKey: principal.key,
    workspaceId: workspace.id,
    repositoryKey: repository.key,
    ref,
  };
  return { principalKey: principal.key, workspace, session };
}

export function ownedWorkspaceId(ownership: OwnedWorkspaceIdentity): string {
  return `${OWNED_PREFIX}${encodeURIComponent(ownership.principalKey)}:${ownership.session.id}`;
}

export function isOwnedWorkspaceId(id: string): boolean {
  return id.startsWith(OWNED_PREFIX) && id.length > OWNED_PREFIX.length;
}

/** Only explicitly marked, newly created records can be restored before the v3 migration. */
export function isOwnedWorkspace(
  snapshot: WorkspaceSnapshot | null | undefined,
  principalKey: PrincipalKey,
  repo?: RepositoryIdentity,
  gitRef?: GitRef,
): snapshot is WorkspaceSnapshot & { ownership: OwnedWorkspaceIdentity } {
  if (!snapshot || !isOwnedWorkspaceId(snapshot.id) || !snapshot.ownership) return false;
  const { ownership } = snapshot;
  return (
    ownership.principalKey === principalKey &&
    ownership.workspace.principalKey === principalKey &&
    ownership.session.principalKey === principalKey &&
    ownership.session.workspaceId === ownership.workspace.id &&
    ownedWorkspaceId(ownership) === snapshot.id &&
    ownership.session.repositoryKey === `gh:github.com:repo:${snapshot.repository.id}` &&
    (repo === undefined || ownership.session.repositoryKey === repo.key) &&
    (gitRef === undefined || ownership.session.ref === gitRef)
  );
}

export function sameOwnership(active: OwnershipGeneration, captured: OwnershipGeneration): boolean {
  return active.generation === captured.generation && active.principalKey === captured.principalKey;
}
