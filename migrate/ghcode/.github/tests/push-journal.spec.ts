import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Test the actual storage module in Chromium, not a mocked IDB transaction.
// Bundle the production TS module as a standalone ES module and serve it only
// through Playwright's route intercept; no test entry is shipped in the app.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const directory = mkdtempSync(join(tmpdir(), "ghcode-idb-"));
let moduleSource = "";
try {
  const output = join(directory, "storage.mjs");
  execFileSync(
    "bun",
    ["build", "./src/workspace/storage.ts", "--target", "browser", "--format", "esm", "--outfile", output],
    { cwd: root, encoding: "utf8" },
  );
  moduleSource = readFileSync(output, "utf8");
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const sourceUrl = "/__ghcode_real_idb_test__.js";

test.beforeEach(async ({ page }) => {
  await page.route(`**${sourceUrl}`, (route) => route.fulfill({
    status: 200, contentType: "application/javascript", body: moduleSource,
  }));
  await page.goto("/");
});

test("real IndexedDB v3 denies cross-principal reads, blobs and push preparation", async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const storage = await import(url);
    const a = "gh:github.com:1001";
    const b = "gh:github.com:2002";
    const sessionId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const id = `ghcode-owned-v2:${encodeURIComponent(a)}:${sessionId}`;
    const workspace = {
      version: 2, id, ref: "main", updatedAt: 1,
      baseSha: "1".repeat(40), treeSha: "2".repeat(40), tree: [],
      repository: {
        id: 42, name: "private", owner: "acme", fullName: "acme/private",
        private: true, defaultBranch: "main", htmlUrl: "", canPush: true,
      },
      ownership: {
        principalKey: a, workspace: { id: workspaceId, principalKey: a },
        session: { id: sessionId, workspaceId, principalKey: a,
          repositoryKey: "gh:github.com:repo:42", ref: "refs/heads/main" },
      },
    };
    storage.bindStoragePrincipal(a);
    await storage.saveWorkspace(workspace);
    await storage.saveBlob(id, "private", "A-only secret");
    const owned = await storage.loadWorkspace(id, a);
    storage.bindStoragePrincipal(b);
    const denied: Record<string, boolean> = {};
    for (const [key, action] of [
      ["workspace", () => storage.loadWorkspace(id, a)],
      ["blob", () => storage.loadBlob(id, "private")],
      ["push", () => storage.beginPushOperation(workspace, [`${id}:local:1:one`])],
    ] as const) {
      try { await action(); denied[key] = false; }
      catch { denied[key] = true; }
    }
    storage.bindStoragePrincipal(`anon:${crypto.randomUUID()}`);
    try { await storage.loadWorkspace(id, a); denied.anonymous = false; }
    catch { denied.anonymous = true; }
    try { storage.bindStoragePrincipal("invalid-principal"); denied.invalidPrincipal = false; }
    catch { denied.invalidPrincipal = true; }
    return { owned: owned?.id === id, denied };
  }, sourceUrl);
  expect(result.owned).toBe(true);
  expect(result.denied).toEqual({
    workspace: true, blob: true, push: true, anonymous: true, invalidPrincipal: true,
  });
});

test("prepared push survives browser reload and confirmed push finalizes atomically", async ({ page }) => {
  const seeded = await page.evaluate(async (url) => {
    const storage = await import(url);
    const principal = "gh:github.com:1001";
    const sessionId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const id = `ghcode-owned-v2:${encodeURIComponent(principal)}:${sessionId}`;
    const workspace = {
      version: 2, id, ref: "main", updatedAt: 1,
      baseSha: "1".repeat(40), treeSha: "2".repeat(40), tree: [],
      repository: {
        id: 42, name: "private", owner: "acme", fullName: "acme/private",
        private: true, defaultBranch: "main", htmlUrl: "", canPush: true,
      },
      ownership: {
        principalKey: principal, workspace: { id: workspaceId, principalKey: principal },
        session: { id: sessionId, workspaceId, principalKey: principal,
          repositoryKey: "gh:github.com:repo:42", ref: "refs/heads/main" },
      },
    };
    storage.bindStoragePrincipal(principal);
    await storage.saveWorkspace(workspace);
    const commitId = `${id}:local:1:one`;
    await storage.saveLocalCommit({
      id: commitId, workspaceId: id, message: "draft", createdAt: 1, files: [],
    });
    const pending = await storage.beginPushOperation(workspace, [commitId]);
    return { workspace, pendingId: pending.id };
  }, sourceUrl);
  await page.reload();
  const recovered = await page.evaluate(async ({ url, workspace, pendingId }) => {
    const storage = await import(url);
    storage.bindStoragePrincipal("gh:github.com:1001");
    let pending = await storage.loadPendingPushOperation(workspace);
    if (!pending || pending.id !== pendingId || pending.phase !== "prepared")
      return { error: "Journal did not survive reload" };
    const deniedEarly = await storage.finalizeConfirmedPush(
      workspace, { ...workspace, baseSha: "3".repeat(40) }, pending,
    ).then(() => false, () => true);
    pending = await storage.advancePushOperation(
      workspace, pending.id, "prepared", "ready", "3".repeat(40),
    );
    const deniedConcurrent = await storage.advancePushOperation(
      workspace, pending.id, "prepared", "ready", "4".repeat(40),
    ).then(() => false, () => true);
    pending = await storage.advancePushOperation(
      workspace, pending.id, "ready", "remote-confirmed", "3".repeat(40),
    );
    const next = { ...workspace, baseSha: "3".repeat(40), treeSha: "4".repeat(40) };
    await storage.finalizeConfirmedPush(workspace, next, pending);
    const reloaded = await storage.loadWorkspace(workspace.id, "gh:github.com:1001");
    const commits = await storage.loadLocalCommits(workspace.id);
    const unfinished = await storage.loadPendingPushOperation(workspace);
    return { deniedEarly, deniedConcurrent, newHead: reloaded?.baseSha, count: commits.length,
      unfinished: unfinished !== null };
  }, { url: sourceUrl, ...seeded });
  expect(recovered).toEqual({
    deniedEarly: true, deniedConcurrent: true,
    newHead: "3".repeat(40), count: 0, unfinished: false,
  });
});

test("real concurrent staged commits cannot both consume the same staging snapshot", async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const storage = await import(url);
    const principal = "gh:github.com:1001";
    const sessionId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const id = `ghcode-owned-v2:${encodeURIComponent(principal)}:${sessionId}`;
    storage.bindStoragePrincipal(principal);
    const staged = {
      key: `${id}:README.md`, workspaceId: id, path: "README.md",
      content: "updated", status: "modified", updatedAt: 1, stagedAt: 2,
    };
    await storage.saveStaged(staged);
    const make = (n: number) => ({
      id: `${id}:local:${n}:uuid`, workspaceId: id,
      createdAt: n, message: "commit", files: [{ ...staged }],
    });
    const results = await Promise.allSettled([
      storage.commitLocalChanges(make(1), [staged]),
      storage.commitLocalChanges(make(2), [staged]),
    ]);
    const commits = await storage.loadLocalCommits(id);
    const remaining = await storage.loadStaged(id);
    return { successful: results.filter((r) => r.status === "fulfilled").length,
      failures: results.filter((r) => r.status === "rejected").length,
      commits: commits.length, staged: remaining.length };
  }, sourceUrl);
  expect(result).toEqual({ successful: 1, failures: 1, commits: 1, staged: 0 });
});

test("real storage quota exception aborts and does not acknowledge a write", async ({ page }) => {
  const outcome = await page.evaluate(async (url) => {
    const storage = await import(url);
    const principal = "gh:github.com:1001";
    const sessionId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const id = `ghcode-owned-v2:${encodeURIComponent(principal)}:${sessionId}`;
    const workspace = {
      version: 2, id, ref: "main", updatedAt: 1,
      baseSha: "1".repeat(40), treeSha: "2".repeat(40), tree: [],
      repository: {
        id: 42, name: "private", owner: "acme", fullName: "acme/private",
        private: true, defaultBranch: "main", htmlUrl: "", canPush: true,
      },
      ownership: {
        principalKey: principal, workspace: { id: workspaceId, principalKey: principal },
        session: { id: sessionId, workspaceId, principalKey: principal,
          repositoryKey: "gh:github.com:repo:42", ref: "refs/heads/main" },
      },
    };
    storage.bindStoragePrincipal(principal);
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Injected capacity exhaustion", "QuotaExceededError");
    };
    let rejected = false;
    try { await storage.saveWorkspace(workspace); }
    catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = original; }
    const snapshot = await storage.loadWorkspace(id, principal);
    return { rejected, persisted: snapshot !== undefined };
  }, sourceUrl);
  expect(outcome).toEqual({ rejected: true, persisted: false });
});
