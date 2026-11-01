import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createGithubBlob,
  createGithubBranchRef,
  createGithubCommit,
  createGithubTree,
  getGithubBlob,
  getGithubBlobBytes,
  getGithubBranchRef,
  getGithubCommit,
  getGithubRepository,
  getGithubTree,
  downloadGithubRepositoryArchive,
  getGithubUser,
  listGithubRefs,
  listGithubRepositories,
  updateGithubBranchRef,
  type GithubRepository,
  type GithubUser,
} from "@/github/client";
import { clearGithubToken, getGithubToken, setGithubToken } from "@/github/auth";
import {
  parseRepositoryInput,
  repositoryFromGithub,
  type CommittedFile,
  type LocalCommit,
  type StagedFile,
  type WorkspaceSnapshot,
  type WorkingFile,
  type WorkingFileStatus,
} from "./model";
import {
  anonymousPrincipal,
  canonicalGitRef,
  createOwnedWorkspaceIdentity,
  githubPrincipal,
  isOwnedWorkspace,
  ownedWorkspaceId,
  repositoryIdentity,
  sameOwnership,
  type OwnershipGeneration,
  type Principal,
} from "./identity";
import {
  attributeUnattributedV2,
  beginPushIntent,
  finishPushAtomic,
  pendingPushIntents,
  updatePushTarget,
  clearStaged,
  commitStagedAtomic,
  forkWorkspaceAtomic,
  loadBlob,
  loadCommittedFiles,
  loadLocalCommits,
  loadOverlays,
  loadRecentWorkspaces,
  loadStaged,
  loadWorkspace,
  rememberWorkspace,
  removeOverlay,
  removeRecords,
  replacePath,
  saveBlob,
  saveOverlay,
  saveWorkspace,
  writeRecords,
} from "./storage";
import {
  createStoredZip,
  downloadBytes,
  downloadText,
  virtualFiles,
  wholeFilePatch,
} from "./export";

export type PatchExportScope = "all" | "working" | "staged" | "commits" | "commit";

type WorkspaceContextValue = {
  token: string | null;
  user: GithubUser | null;
  principal: Principal;
  authPhase: "signed-out" | "anonymous" | "resolving" | "authenticated" | "failed" | "invalidated";
  ownershipGeneration: number;
  repositories: GithubRepository[];
  workspace: WorkspaceSnapshot | null;
  refs: Awaited<ReturnType<typeof listGithubRefs>>;
  overlays: WorkingFile[];
  staged: StagedFile[];
  committedFiles: CommittedFile[];
  commits: LocalCommit[];
  recent: WorkspaceSnapshot[];
  remoteHeadSha: string | null;
  loading: boolean;
  error: string | null;
  dialogOpen: boolean;
  connectToken: (token: string) => Promise<void>;
  signOut: () => void;
  setDialogOpen: (open: boolean) => void;
  openRepository: (input: string, ref?: string) => Promise<void>;
  switchRef: (ref: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  syncWorkspace: () => Promise<void>;
  readBaseFile: (path: string, sha?: string) => Promise<string>;
  readBaselineFile: (path: string) => Promise<string>;
  readFile: (path: string, sha?: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  renamePath: (path: string, nextPath: string) => Promise<void>;
  fileStatus: (path: string) => WorkingFileStatus | null;
  stageFile: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  unstageAll: () => Promise<void>;
  discardFile: (path: string) => Promise<void>;
  commitStaged: (message: string) => Promise<LocalCommit>;
  createBranch: (branch: string) => Promise<void>;
  pushLocalCommits: () => Promise<string>;
  recoverLegacy: (legacyId: string) => Promise<void>;
  exportPatch: (scope?: PatchExportScope, commitId?: string) => Promise<void>;
  exportWorkspaceZip: () => Promise<void>;
  exportRemoteArchive: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function overlayKey(id: string, path: string) {
  return `${id}:${path}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [anonymous] = useState(anonymousPrincipal);
  const [principal, setPrincipal] = useState<Principal>(anonymous);
  const [authPhase, setAuthPhase] = useState<WorkspaceContextValue["authPhase"]>(() =>
    getGithubToken() ? "resolving" : "anonymous",
  );
  const [ownershipGeneration, setOwnershipGeneration] = useState(0);
  const authority = useRef<OwnershipGeneration>({ principalKey: anonymous.key, generation: 0 });
  const channel = useRef<BroadcastChannel | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GithubUser | null>(null);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [refs, setRefs] = useState<Awaited<ReturnType<typeof listGithubRefs>>>([]);
  const [overlays, setOverlays] = useState<WorkingFile[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [committedFiles, setCommittedFiles] = useState<CommittedFile[]>([]);
  const [commits, setCommits] = useState<LocalCommit[]>([]);
  const [recent, setRecent] = useState<WorkspaceSnapshot[]>(() =>
    loadRecentWorkspaces(anonymous.key),
  );
  const [remoteHeadSha, setRemoteHeadSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const capture = useCallback((): OwnershipGeneration => ({ ...authority.current }), []);
  const isCurrent = useCallback(
    (lease: OwnershipGeneration) => sameOwnership(authority.current, lease),
    [],
  );
  const assertCurrent = useCallback((lease: OwnershipGeneration) => {
    if (!sameOwnership(authority.current, lease))
      throw new Error("Repository session invalidated by an identity transition.");
  }, []);
  const transition = useCallback((next: Principal, phase: WorkspaceContextValue["authPhase"]) => {
    const generation = authority.current.generation + 1;
    authority.current = { principalKey: next.key, generation };
    setOwnershipGeneration(generation);
    setPrincipal(next);
    setAuthPhase(phase);
    setToken(null);
    setUser(null);
    setRepositories([]);
    setWorkspace(null);
    setRefs([]);
    setOverlays([]);
    setStaged([]);
    setCommittedFiles([]);
    setCommits([]);
    setRemoteHeadSha(null);
    setRecent(phase === "resolving" ? [] : loadRecentWorkspaces(next.key));
    setError(null);
    setLoading(false);
    return { ...authority.current };
  }, []);

  const loadLocalState = useCallback(
    async (id: string, lease: OwnershipGeneration) => {
      assertCurrent(lease);
      const [nextOverlays, nextStaged, nextCommitted, nextCommits] = await Promise.all([
        loadOverlays(id),
        loadStaged(id),
        loadCommittedFiles(id),
        loadLocalCommits(id),
      ]);
      assertCurrent(lease);
      setOverlays(nextOverlays);
      setStaged(nextStaged);
      setCommittedFiles(nextCommitted);
      setCommits(nextCommits);
      return {
        overlays: nextOverlays,
        staged: nextStaged,
        committedFiles: nextCommitted,
        commits: nextCommits,
      };
    },
    [assertCurrent],
  );

  const connectToken = useCallback(
    async (candidate: string) => {
      const value = candidate.trim();
      if (!value) throw new Error("GitHub token cannot be empty.");
      const lease = transition(anonymous, "resolving");
      setLoading(true);
      try {
        // /user is authoritative. A token and mutable login never establish a principal.
        const nextUser = await getGithubUser(value);
        assertCurrent(lease);
        const nextRepositories = await listGithubRepositories(value);
        assertCurrent(lease);
        const verified = githubPrincipal(nextUser.id);
        setGithubToken(value);
        transition(verified, "authenticated");
        setToken(value);
        setUser(nextUser);
        setRepositories(nextRepositories);
        setRecent(loadRecentWorkspaces(verified.key));
        channel.current?.postMessage({ type: "invalidate" });
      } catch (reason) {
        if (isCurrent(lease)) {
          clearGithubToken();
          transition(anonymous, "failed");
          setError(reason instanceof Error ? reason.message : String(reason));
        }
        throw reason;
      } finally {
        if (isCurrent(lease)) setLoading(false);
      }
    },
    [anonymous, assertCurrent, isCurrent, transition],
  );

  const signOut = useCallback(() => {
    clearGithubToken();
    transition(anonymous, "anonymous");
    channel.current?.postMessage({ type: "invalidate" });
  }, [anonymous, transition]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const next = new BroadcastChannel("ghcode-identity-invalidation-v1");
    next.onmessage = (event: MessageEvent) => {
      if (event.data?.type !== "invalidate") return;
      clearGithubToken();
      transition(anonymous, "invalidated");
      setError("Account changed in another tab. Sign in again to access private repositories.");
    };
    channel.current = next;
    return () => {
      if (channel.current === next) channel.current = null;
      next.close();
    };
  }, [anonymous, transition]);

  useEffect(() => {
    const existing = getGithubToken();
    if (existing) {
      void connectToken(existing).catch(() => {});
    }
    // The stored token is an unverified credential; never restore private content on mount.
  }, [connectToken]);

  const openRepository = useCallback(
    async (input: string, requestedRef?: string) => {
      if (authPhase === "resolving" || authPhase === "failed" || authPhase === "invalidated")
        throw new Error(
          "Resolve your GitHub identity or continue anonymously before opening a repository.",
        );
      const lease = capture();
      const fullName = parseRepositoryInput(input);
      setLoading(true);
      setError(null);
      try {
        // Remote authorization MUST precede any local storage lookup.
        const repository = await getGithubRepository(fullName, token);
        assertCurrent(lease);
        if (!token && repository.private) throw new Error("Sign in to open a private repository.");
        const repositoryKey = repositoryIdentity(repository);
        const ref = requestedRef || repository.default_branch;
        const nextRefs = await listGithubRefs(repository.full_name, token).catch(() => []);
        assertCurrent(lease);
        const fullRef = canonicalGitRef(ref, nextRefs);
        const matching = recent.find((item) =>
          isOwnedWorkspace(item, lease.principalKey, repositoryKey, fullRef),
        );
        const cached = matching ? await loadWorkspace(matching.id, lease.principalKey) : undefined;
        assertCurrent(lease);
        const remoteCommit = await getGithubCommit(repository.full_name, ref, token);
        assertCurrent(lease);
        const localState: [WorkingFile[], StagedFile[], CommittedFile[], LocalCommit[]] = cached
          ? await Promise.all([
              loadOverlays(cached.id),
              loadStaged(cached.id),
              loadCommittedFiles(cached.id),
              loadLocalCommits(cached.id),
            ])
          : [[], [], [], []];
        assertCurrent(lease);
        const hasLocalState = localState.some((items) => items.length > 0);
        if (cached && hasLocalState && cached.baseSha !== remoteCommit.sha) {
          setWorkspace(cached);
          setOverlays(localState[0]);
          setStaged(localState[1]);
          setCommittedFiles(localState[2]);
          setCommits(localState[3]);
          setRemoteHeadSha(remoteCommit.sha);
          setRecent(rememberWorkspace(cached));
          setRefs(nextRefs);
          setError("Remote ref changed. Local work is pinned to its original base until sync.");
          setDialogOpen(false);
          return;
        }
        const tree = await getGithubTree(repository.full_name, remoteCommit.commit.tree.sha, token);
        assertCurrent(lease);
        const ownership =
          cached?.ownership ?? createOwnedWorkspaceIdentity(principal, repositoryKey, fullRef);
        const snapshot: WorkspaceSnapshot = {
          version: 2,
          id: cached?.id ?? ownedWorkspaceId(ownership),
          ownership,
          repository: repositoryFromGithub(repository),
          ref,
          baseSha: remoteCommit.sha,
          treeSha: tree.sha,
          tree: tree.tree,
          updatedAt: Date.now(),
        };
        // Writes use only newly attributed v2 keys. Old anonymous records remain untouched.
        await saveWorkspace(snapshot);
        assertCurrent(lease);
        setWorkspace(snapshot);
        setRemoteHeadSha(remoteCommit.sha);
        await loadLocalState(snapshot.id, lease);
        assertCurrent(lease);
        setRecent(rememberWorkspace(snapshot));
        setRefs(nextRefs);
        setDialogOpen(false);
      } catch (reason) {
        if (!isCurrent(lease)) throw new Error("Repository session invalidated.");
        setError(reason instanceof Error ? reason.message : String(reason));
        // No 401/403/404 fallback. A failed remote request does not authorize cached content.
        throw reason;
      } finally {
        if (isCurrent(lease)) setLoading(false);
      }
    },
    [authPhase, capture, assertCurrent, isCurrent, loadLocalState, principal, recent, token],
  );

  const switchRef = useCallback(
    async (ref: string) => {
      if (!workspace) return;
      await openRepository(workspace.repository.fullName, ref);
    },
    [openRepository, workspace],
  );

  const refreshWorkspace = useCallback(async () => {
    if (!workspace) return;
    await openRepository(workspace.repository.fullName, workspace.ref);
  }, [openRepository, workspace]);

  const syncWorkspace = useCallback(async () => {
    if (!workspace) throw new Error("No workspace is open.");
    const lease = capture();
    assertCurrent(lease);
    setLoading(true);
    setError(null);
    try {
      const remoteCommit = await getGithubCommit(
        workspace.repository.fullName,
        workspace.ref,
        token,
      );
      assertCurrent(lease);
      setRemoteHeadSha(remoteCommit.sha);
      if (remoteCommit.sha === workspace.baseSha) return;

      const remoteTree = await getGithubTree(
        workspace.repository.fullName,
        remoteCommit.commit.tree.sha,
        token,
      );
      assertCurrent(lease);
      const hasLocalState =
        overlays.length > 0 || staged.length > 0 || committedFiles.length > 0 || commits.length > 0;

      if (hasLocalState) {
        const touched = new Set<string>();
        for (const file of [...committedFiles, ...overlays, ...staged]) {
          touched.add(file.path);
          if ("renamedFrom" in file && file.renamedFrom) touched.add(file.renamedFrom);
        }

        const conflicts: string[] = [];
        for (const path of touched) {
          const before = workspace.tree.find(
            (entry) => entry.type === "blob" && entry.path === path,
          );
          const after = remoteTree.tree.find(
            (entry) => entry.type === "blob" && entry.path === path,
          );
          if (before?.sha !== after?.sha || before?.mode !== after?.mode) conflicts.push(path);
        }
        if (conflicts.length) {
          throw new Error(
            `Remote changes overlap local work: ${conflicts.slice(0, 5).join(", ")}${conflicts.length > 5 ? "…" : ""}. Resolve or export the patch before syncing.`,
          );
        }
      }

      const snapshot: WorkspaceSnapshot = {
        ...workspace,
        baseSha: remoteCommit.sha,
        treeSha: remoteTree.sha,
        tree: remoteTree.tree,
        updatedAt: Date.now(),
      };
      assertCurrent(lease);
      await saveWorkspace(snapshot);
      assertCurrent(lease);
      setWorkspace(snapshot);
      setRecent(rememberWorkspace(snapshot));
      setRemoteHeadSha(remoteCommit.sha);
      const nextRefs = await listGithubRefs(workspace.repository.fullName, token).catch(() => refs);
      assertCurrent(lease);
      setRefs(nextRefs);
    } finally {
      if (isCurrent(lease)) setLoading(false);
    }
  }, [
    assertCurrent,
    capture,
    committedFiles,
    commits,
    isCurrent,
    overlays,
    refs,
    staged,
    token,
    workspace,
  ]);

  const readBaseFile = useCallback(
    async (path: string, sha?: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const entry = sha
        ? { sha }
        : workspace.tree.find((candidate) => candidate.path === path && candidate.type === "blob");
      if (!entry?.sha) throw new Error(`File does not exist in the remote base tree: ${path}`);
      const lease = capture();
      assertCurrent(lease);
      const cached = await loadBlob(workspace.id, entry.sha);
      assertCurrent(lease);
      if (cached !== null) return cached;
      const content = await getGithubBlob(workspace.repository.fullName, entry.sha, token);
      assertCurrent(lease);
      await saveBlob(workspace.id, entry.sha, content);
      assertCurrent(lease);
      return content;
    },
    [assertCurrent, capture, token, workspace],
  );

  const readBaselineFile = useCallback(
    async (path: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const committed = committedFiles.find((candidate) => candidate.path === path);
      if (committed) {
        if (committed.deleted) throw new Error(`File is deleted in local commits: ${path}`);
        if (committed.content !== undefined) return committed.content;
      }
      return readBaseFile(path);
    },
    [committedFiles, readBaseFile, workspace],
  );

  const baselineExists = useCallback(
    (path: string) => {
      if (!workspace) return false;
      const committed = committedFiles.find((candidate) => candidate.path === path);
      if (committed) return !committed.deleted;
      return workspace.tree.some((entry) => entry.path === path && entry.type === "blob");
    },
    [committedFiles, workspace],
  );

  const readFile = useCallback(
    async (path: string, sha?: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const overlay = overlays.find((candidate) => candidate.path === path);
      if (overlay?.status === "deleted") throw new Error(`File is deleted locally: ${path}`);
      if (overlay?.content !== undefined) return overlay.content;
      if (sha) return readBaseFile(path, sha);
      return readBaselineFile(path);
    },
    [overlays, readBaseFile, readBaselineFile, workspace],
  );

  const refreshOverlays = useCallback(async () => {
    if (!workspace) return;
    const lease = capture();
    const next = await loadOverlays(workspace.id);
    assertCurrent(lease);
    setOverlays(next);
  }, [assertCurrent, capture, workspace]);

  const commitOverlay = useCallback(
    async (file: WorkingFile | null, path: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const lease = capture();
      assertCurrent(lease);
      if (file) await saveOverlay(file);
      else await removeOverlay(workspace.id, path);
      assertCurrent(lease);
      await refreshOverlays();
    },
    [assertCurrent, capture, refreshOverlays, workspace],
  );

  const writeFile = useCallback(
    async (path: string, content: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const currentOverlay = overlays.find((entry) => entry.path === path);
      const exists = baselineExists(path);
      if (exists) {
        const baselineContent = await readBaselineFile(path);
        if (baselineContent === content) {
          await commitOverlay(null, path);
          return;
        }
      }
      const remoteEntry = workspace.tree.find(
        (entry) => entry.path === path && entry.type === "blob",
      );
      await commitOverlay(
        {
          key: overlayKey(workspace.id, path),
          workspaceId: workspace.id,
          path,
          status: currentOverlay?.status === "renamed" ? "renamed" : exists ? "modified" : "added",
          content,
          baseSha: remoteEntry?.sha ?? currentOverlay?.baseSha,
          renamedFrom: currentOverlay?.renamedFrom,
          updatedAt: Date.now(),
        },
        path,
      );
    },
    [baselineExists, commitOverlay, overlays, readBaselineFile, workspace],
  );

  const createFile = useCallback(
    async (path: string, content = "") => {
      if (!workspace) throw new Error("No workspace is open.");
      const normalized = path.trim().replace(/^\/+/, "");
      if (!normalized) throw new Error("File path cannot be empty.");
      const existsInWorkingTree =
        overlays.some((entry) => entry.path === normalized && entry.status !== "deleted") ||
        (!overlays.some((entry) => entry.path === normalized && entry.status === "deleted") &&
          baselineExists(normalized));
      if (existsInWorkingTree) throw new Error(`Path already exists: ${normalized}`);
      await writeFile(normalized, content);
    },
    [baselineExists, overlays, workspace, writeFile],
  );

  const deletePath = useCallback(
    async (path: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const existing = overlays.find((entry) => entry.path === path);
      if (!baselineExists(path) && existing?.status === "added") {
        await commitOverlay(null, path);
        return;
      }
      const remoteEntry = workspace.tree.find(
        (entry) => entry.path === path && entry.type === "blob",
      );
      await commitOverlay(
        {
          key: overlayKey(workspace.id, path),
          workspaceId: workspace.id,
          path,
          status: "deleted",
          baseSha: remoteEntry?.sha ?? existing?.baseSha,
          updatedAt: Date.now(),
        },
        path,
      );
    },
    [baselineExists, commitOverlay, overlays, workspace],
  );

  const renamePath = useCallback(
    async (path: string, nextPath: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const target = nextPath.trim().replace(/^\/+/, "");
      if (!target || target === path) return;
      const targetExists =
        overlays.some((entry) => entry.path === target && entry.status !== "deleted") ||
        (!overlays.some((entry) => entry.path === target && entry.status === "deleted") &&
          baselineExists(target));
      if (targetExists) throw new Error("Path already exists: " + target);
      const lease = capture();
      const content = await readFile(path);
      assertCurrent(lease);
      const sourceWasAdded = !baselineExists(path);
      const remoteEntry = workspace.tree.find(
        (entry) => entry.path === path && entry.type === "blob",
      );
      const now = Date.now();
      const destination: WorkingFile = {
        key: overlayKey(workspace.id, target),
        workspaceId: workspace.id,
        path: target,
        status: sourceWasAdded ? "added" : "renamed",
        content,
        baseSha: sourceWasAdded ? undefined : remoteEntry?.sha,
        renamedFrom: sourceWasAdded ? undefined : path,
        updatedAt: now,
      };
      const sourceDelete: WorkingFile = {
        key: overlayKey(workspace.id, path),
        workspaceId: workspace.id,
        path,
        status: "deleted",
        baseSha: remoteEntry?.sha,
        updatedAt: now,
      };
      await replacePath(
        workspace.id,
        sourceWasAdded ? [{ kind: "overlay", name: path }] : [],
        sourceWasAdded
          ? [{ kind: "overlay", name: target, value: destination }]
          : [
              { kind: "overlay", name: target, value: destination },
              { kind: "overlay", name: path, value: sourceDelete },
            ],
      );
      assertCurrent(lease);
      await refreshOverlays();
    },
    [assertCurrent, baselineExists, capture, overlays, readFile, refreshOverlays, workspace],
  );

  const fileStatus = useCallback(
    (path: string) => overlays.find((entry) => entry.path === path)?.status ?? null,
    [overlays],
  );

  const stageGroupFor = useCallback(
    (path: string) => {
      const selected = overlays.find((entry) => entry.path === path);
      if (!selected) return [];
      const group = [selected];
      if (selected.status === "renamed" && selected.renamedFrom) {
        const sourceDelete = overlays.find(
          (entry) => entry.path === selected.renamedFrom && entry.status === "deleted",
        );
        if (sourceDelete) group.push(sourceDelete);
      } else if (selected.status === "deleted") {
        const renameTarget = overlays.find(
          (entry) => entry.status === "renamed" && entry.renamedFrom === selected.path,
        );
        if (renameTarget) group.push(renameTarget);
      }
      return group;
    },
    [overlays],
  );

  const stageFile = useCallback(
    async (path: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const lease = capture();
      const now = Date.now();
      const files = stageGroupFor(path).map((file) => ({ ...file, stagedAt: now }));
      if (files.length) await writeRecords(workspace.id, "staged", files);
      const next = await loadStaged(workspace.id);
      assertCurrent(lease);
      setStaged(next);
    },
    [assertCurrent, capture, stageGroupFor, workspace],
  );

  const stageAll = useCallback(async () => {
    if (!workspace) throw new Error("No workspace is open.");
    const lease = capture();
    const now = Date.now();
    if (overlays.length)
      await writeRecords(
        workspace.id,
        "staged",
        overlays.map((file) => ({ ...file, stagedAt: now })),
      );
    const next = await loadStaged(workspace.id);
    assertCurrent(lease);
    setStaged(next);
  }, [assertCurrent, capture, overlays, workspace]);

  const unstageFile = useCallback(
    async (path: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const lease = capture();
      const selected = staged.find((entry) => entry.path === path);
      const paths = new Set([path]);
      if (selected?.status === "renamed" && selected.renamedFrom) paths.add(selected.renamedFrom);
      if (selected?.status === "deleted") {
        const target = staged.find(
          (entry) => entry.status === "renamed" && entry.renamedFrom === selected.path,
        );
        if (target) paths.add(target.path);
      }
      await removeRecords(workspace.id, "staged", [...paths]);
      const next = await loadStaged(workspace.id);
      assertCurrent(lease);
      setStaged(next);
    },
    [assertCurrent, capture, staged, workspace],
  );

  const unstageAll = useCallback(async () => {
    if (!workspace) throw new Error("No workspace is open.");
    const lease = capture();
    await clearStaged(workspace.id);
    assertCurrent(lease);
    setStaged([]);
  }, [assertCurrent, capture, workspace]);

  const discardFile = useCallback(
    async (path: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const lease = capture();
      const selected = overlays.find((entry) => entry.path === path);
      const paths = new Set([path]);
      if (selected?.status === "renamed" && selected.renamedFrom) paths.add(selected.renamedFrom);
      if (selected?.status === "deleted") {
        const target = overlays.find(
          (entry) => entry.status === "renamed" && entry.renamedFrom === selected.path,
        );
        if (target) paths.add(target.path);
      }
      await replacePath(
        workspace.id,
        [...paths].flatMap((name) => [
          { kind: "overlay" as const, name },
          { kind: "staged" as const, name },
        ]),
        [],
      );
      const nextStaged = await loadStaged(workspace.id);
      assertCurrent(lease);
      await refreshOverlays();
      assertCurrent(lease);
      setStaged(nextStaged);
    },
    [assertCurrent, capture, overlays, refreshOverlays, workspace],
  );

  const commitStaged = useCallback(
    async (message: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const lease = capture();
      assertCurrent(lease);
      const commit = await commitStagedAtomic(workspace.id, message);
      assertCurrent(lease);
      await loadLocalState(workspace.id, lease);
      return commit;
    },
    [assertCurrent, capture, loadLocalState, workspace],
  );

  const createBranch = useCallback(
    async (branch: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      if (!token) throw new Error("Sign in with GitHub before creating a branch.");
      const name = branch.trim();
      if (
        !name ||
        /[\s~^:?*\\[\\]\\\\]/.test(name) ||
        name.includes("..") ||
        name.startsWith("/") ||
        name.endsWith("/")
      ) {
        throw new Error("Enter a valid Git branch name.");
      }
      setLoading(true);
      setError(null);
      try {
        const lease = capture();
        await createGithubBranchRef(workspace.repository.fullName, name, workspace.baseSha, token);
        assertCurrent(lease);
        const ownership = createOwnedWorkspaceIdentity(
          principal,
          {
            key: `gh:github.com:repo:${workspace.repository.id}`,
            id: workspace.repository.id,
            fullName: workspace.repository.fullName,
          },
          `refs/heads/${name}`,
        );
        const nextId = ownedWorkspaceId(ownership);
        const nextWorkspace: WorkspaceSnapshot = {
          ...workspace,
          id: nextId,
          ownership,
          ref: name,
          updatedAt: Date.now(),
        };
        await forkWorkspaceAtomic(workspace.id, nextWorkspace);
        assertCurrent(lease);
        setWorkspace(nextWorkspace);
        setRemoteHeadSha(workspace.baseSha);
        setRecent(rememberWorkspace(nextWorkspace));
        const nextRefs = await listGithubRefs(workspace.repository.fullName, token);
        assertCurrent(lease);
        setRefs(nextRefs);
        await loadLocalState(nextId, lease);
      } finally {
        setLoading(false);
      }
    },
    [
      assertCurrent,
      capture,
      loadLocalState,
      principal,
      token,
      workspace,
    ],
  );

  const pushLocalCommits = useCallback(async () => {
    if (!workspace) throw new Error("No workspace is open.");
    if (!token) throw new Error("Sign in with GitHub before pushing.");
    if (!commits.length) throw new Error("There are no local commits to push.");
    const branch = refs.find(
      (candidate) => candidate.kind === "branch" && candidate.name === workspace.ref,
    );
    if (!branch)
      throw new Error("Push requires a branch workspace. Tags and detached refs are read-only.");

    setLoading(true);
    setError(null);
    try {
      const lease = capture();
      const pending = await pendingPushIntents(workspace.id);
      assertCurrent(lease);
      if (pending.length) {
        const remote = await getGithubBranchRef(
          workspace.repository.fullName,
          workspace.ref,
          token,
        );
        assertCurrent(lease);
        const recoverable = pending.find(
          (op) => op.state === "target-ready" && op.targetSha === remote.object.sha,
        );
        if (!recoverable) {
          throw new Error(
            "A previous push has an unresolved outcome. Local commits are preserved; reconcile before retrying.",
          );
        }
        const actualCommit = await getGithubCommit(
          workspace.repository.fullName,
          remote.object.sha,
          token,
        );
        const actualTree = await getGithubTree(
          workspace.repository.fullName,
          actualCommit.commit.tree.sha,
          token,
        );
        const recoveredSnapshot: WorkspaceSnapshot = {
          ...workspace,
          baseSha: remote.object.sha,
          treeSha: actualTree.sha,
          tree: actualTree.tree,
          updatedAt: Date.now(),
        };
        await finishPushAtomic(recoveredSnapshot, overlays, recoverable.id);
        assertCurrent(lease);
        setWorkspace(recoveredSnapshot);
        setRemoteHeadSha(remote.object.sha);
        setRecent(rememberWorkspace(recoveredSnapshot));
        await loadLocalState(workspace.id, lease);
        return remote.object.sha;
      }
      const liveRef = await getGithubBranchRef(workspace.repository.fullName, workspace.ref, token);
      assertCurrent(lease);
      if (liveRef.object.sha !== workspace.baseSha) {
        setRemoteHeadSha(liveRef.object.sha);
        throw new Error(
          `Remote branch moved from ${workspace.baseSha.slice(0, 7)} to ${liveRef.object.sha.slice(0, 7)}. Fetch/sync before pushing.`,
        );
      }

      const pushOp = await beginPushIntent(workspace.id, workspace.baseSha, commits);
      assertCurrent(lease);
      let parentSha = workspace.baseSha;
      let treeSha = workspace.treeSha;

      for (const localCommit of commits) {
        const mutations = [];
        for (const file of localCommit.files) {
          const sourcePath = file.renamedFrom || file.path;
          const existing = workspace.tree.find(
            (entry) =>
              entry.type === "blob" && (entry.path === file.path || entry.path === sourcePath),
          );
          const mode =
            existing?.mode && ["100644", "100755", "120000"].includes(existing.mode)
              ? existing.mode
              : "100644";

          if (file.status === "deleted") {
            mutations.push({ path: file.path, mode, type: "blob" as const, sha: null });
            continue;
          }

          const blob = await createGithubBlob(
            workspace.repository.fullName,
            file.content ?? "",
            token,
          );
          mutations.push({ path: file.path, mode, type: "blob" as const, sha: blob.sha });
        }

        const tree = await createGithubTree(
          workspace.repository.fullName,
          treeSha,
          mutations,
          token,
        );
        const commit = await createGithubCommit(
          workspace.repository.fullName,
          localCommit.message,
          tree.sha,
          [parentSha],
          token,
        );
        parentSha = commit.sha;
        treeSha = tree.sha;
      }

      assertCurrent(lease);
      await updatePushTarget(workspace.id, pushOp, parentSha);
      assertCurrent(lease);
      await updateGithubBranchRef(workspace.repository.fullName, workspace.ref, parentSha, token);
      assertCurrent(lease);

      const remoteCommit = await getGithubCommit(workspace.repository.fullName, parentSha, token);
      const remoteTree = await getGithubTree(
        workspace.repository.fullName,
        remoteCommit.commit.tree.sha,
        token,
      );
      const snapshot: WorkspaceSnapshot = {
        ...workspace,
        baseSha: parentSha,
        treeSha: remoteTree.sha,
        tree: remoteTree.tree,
        updatedAt: Date.now(),
      };
      assertCurrent(lease);
      await finishPushAtomic(snapshot, overlays, pushOp);

      assertCurrent(lease);
      setWorkspace(snapshot);
      setRemoteHeadSha(parentSha);
      setRecent(rememberWorkspace(snapshot));
      await loadLocalState(workspace.id, lease);
      return parentSha;
    } finally {
      setLoading(false);
    }
  }, [assertCurrent, capture, commits, loadLocalState, overlays, refs, token, workspace]);

  const recoverLegacy = useCallback(
    async (legacyId: string) => {
      if (!workspace) throw new Error("Open and verify the matching repository and ref first.");
      const lease = capture();
      assertCurrent(lease);
      const snapshot = await attributeUnattributedV2(legacyId, workspace, true);
      assertCurrent(lease);
      setWorkspace(snapshot);
      setRecent(rememberWorkspace(snapshot));
      await loadLocalState(snapshot.id, lease);
      assertCurrent(lease);
      setDialogOpen(false);
    },
    [assertCurrent, capture, loadLocalState, workspace],
  );

  const exportPatch = useCallback(
    async (scope: PatchExportScope = "all", commitId?: string) => {
      if (!workspace) throw new Error("No workspace is open.");
      const lease = capture();

      const readRemote = async (path: string): Promise<string | null> => {
        const entry = workspace.tree.find(
          (candidate) => candidate.type === "blob" && candidate.path === path,
        );
        return entry ? readBaseFile(path, entry.sha) : null;
      };

      const readCommitted = async (path: string): Promise<string | null> => {
        const committed = committedFiles.find((candidate) => candidate.path === path);
        if (committed) {
          if (committed.deleted) return null;
          if (committed.content !== undefined) return committed.content;
        }
        return readRemote(path);
      };

      const contentAfter = (file: WorkingFile | StagedFile, before: string | null) =>
        file.status === "deleted" ? null : (file.content ?? before);

      const parts: string[] = [];
      const appendPatch = (path: string, before: string | null, after: string | null) => {
        if (before === after) return;
        parts.push(wholeFilePatch(path, before, after));
      };

      if (scope === "working") {
        for (const file of [...overlays].sort((left, right) =>
          left.path.localeCompare(right.path),
        )) {
          const before = await readCommitted(file.path);
          appendPatch(file.path, before, contentAfter(file, before));
        }
      } else if (scope === "staged") {
        for (const file of [...staged].sort((left, right) => left.path.localeCompare(right.path))) {
          const before = await readCommitted(file.path);
          appendPatch(file.path, before, contentAfter(file, before));
        }
      } else if (scope === "commits") {
        for (const file of [...committedFiles].sort((left, right) =>
          left.path.localeCompare(right.path),
        )) {
          const before = await readRemote(file.path);
          const after = file.deleted ? null : (file.content ?? before);
          appendPatch(file.path, before, after);
        }
      } else if (scope === "commit") {
        const targetIndex = commits.findIndex((candidate) => candidate.id === commitId);
        if (targetIndex < 0) throw new Error("Local commit was not found.");
        const target = commits[targetIndex];
        const targetFiles = new Map(target.files.map((file) => [file.path, file]));

        for (const path of [...targetFiles.keys()].sort()) {
          let before = await readRemote(path);
          for (let index = 0; index < targetIndex; index += 1) {
            const prior = commits[index].files.find((file) => file.path === path);
            if (prior) before = contentAfter(prior, before);
          }
          const file = targetFiles.get(path);
          if (!file) continue;
          appendPatch(path, before, contentAfter(file, before));
        }
      } else {
        const paths = new Set<string>();
        for (const file of committedFiles) paths.add(file.path);
        for (const file of overlays) paths.add(file.path);

        for (const path of [...paths].sort()) {
          const before = await readRemote(path);
          let after: string | null = null;
          try {
            after = await readFile(path);
          } catch {
            after = null;
          }
          appendPatch(path, before, after);
        }
      }

      if (!parts.length) throw new Error("There are no changes in this patch scope.");

      const ref = workspace.ref.replace(/[^A-Za-z0-9._-]+/g, "-");
      let suffix: string = scope;
      if (scope === "commit") {
        const target = commits.find((candidate) => candidate.id === commitId);
        const label = target?.message
          .trim()
          .slice(0, 48)
          .replace(/[^A-Za-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        suffix = label ? `commit-${label}` : "commit";
      }
      assertCurrent(lease);
      downloadText(
        parts.join("\n"),
        `${workspace.repository.name}-${ref}-${suffix}.patch`,
        "text/x-patch;charset=utf-8",
      );
    },
    [
      assertCurrent,
      capture,
      committedFiles,
      commits,
      overlays,
      readBaseFile,
      readFile,
      staged,
      workspace,
    ],
  );

  const exportWorkspaceZip = useCallback(async () => {
    if (!workspace) throw new Error("No workspace is open.");
    const lease = capture();
    setLoading(true);
    setError(null);
    try {
      const files = virtualFiles(workspace.tree, committedFiles, overlays);
      const zipFiles = [];
      for (const file of files) {
        const bytes =
          file.content !== undefined
            ? new TextEncoder().encode(file.content)
            : file.sha
              ? await getGithubBlobBytes(workspace.repository.fullName, file.sha, token)
              : new Uint8Array();
        zipFiles.push({ path: file.path, bytes });
      }
      assertCurrent(lease);
      const archive = createStoredZip(zipFiles);
      const filename = `${workspace.repository.name}-${workspace.ref.replace(/[^A-Za-z0-9._-]+/g, "-")}-workspace.zip`;
      downloadBytes(archive, filename, "application/zip");
    } finally {
      if (isCurrent(lease)) setLoading(false);
    }
  }, [assertCurrent, capture, committedFiles, isCurrent, overlays, token, workspace]);

  const exportRemoteArchive = useCallback(async () => {
    if (!workspace) throw new Error("No workspace is open.");
    const lease = capture();
    setLoading(true);
    setError(null);
    try {
      const archive = await downloadGithubRepositoryArchive(
        workspace.repository.fullName,
        workspace.ref,
        token,
      );
      assertCurrent(lease);
      const filename = `${workspace.repository.name}-${workspace.ref.replace(/[^A-Za-z0-9._-]+/g, "-")}-remote.zip`;
      downloadBytes(archive, filename, "application/zip");
    } finally {
      if (isCurrent(lease)) setLoading(false);
    }
  }, [assertCurrent, capture, isCurrent, token, workspace]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      token,
      user,
      principal,
      authPhase,
      ownershipGeneration,
      repositories,
      workspace,
      refs,
      overlays,
      staged,
      committedFiles,
      commits,
      recent,
      remoteHeadSha,
      loading,
      error,
      dialogOpen,
      connectToken,
      signOut,
      setDialogOpen,
      openRepository,
      switchRef,
      refreshWorkspace,
      syncWorkspace,
      readBaseFile,
      readBaselineFile,
      readFile,
      writeFile,
      createFile,
      deletePath,
      renamePath,
      fileStatus,
      stageFile,
      stageAll,
      unstageFile,
      unstageAll,
      discardFile,
      commitStaged,
      createBranch,
      pushLocalCommits,
      recoverLegacy,
      exportPatch,
      exportWorkspaceZip,
      exportRemoteArchive,
    }),
    [
      token,
      user,
      principal,
      authPhase,
      ownershipGeneration,
      repositories,
      workspace,
      refs,
      overlays,
      staged,
      committedFiles,
      commits,
      recent,
      remoteHeadSha,
      loading,
      error,
      dialogOpen,
      connectToken,
      signOut,
      openRepository,
      switchRef,
      refreshWorkspace,
      syncWorkspace,
      readBaseFile,
      readBaselineFile,
      readFile,
      writeFile,
      createFile,
      deletePath,
      renamePath,
      fileStatus,
      stageFile,
      stageAll,
      unstageFile,
      unstageAll,
      discardFile,
      commitStaged,
      createBranch,
      pushLocalCommits,
      recoverLegacy,
      exportPatch,
      exportWorkspaceZip,
      exportRemoteArchive,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace context is not available");
  return value;
}
