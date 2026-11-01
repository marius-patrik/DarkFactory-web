import { expect, test, type Page } from "@playwright/test";
import { installGithubMock, MOCK_REPOSITORY, PUBLIC_REPOSITORY } from "./github-mock";

const DB = "darkfactory-workbench";
const LEGACY = ["workspaces", "blobs", "overlays", "staged", "committed", "commits"];

async function openPublic(page: Page) {
  await page.getByRole("button", { name: /Open Repository/ }).first().click();
  await page.getByRole("textbox", { name: "Repository" }).fill(PUBLIC_REPOSITORY);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".workspace-repository-button")).toContainText(PUBLIC_REPOSITORY);
}
async function readV3(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ["workspaces", "blobs", "overlays", "staged", "committed", "commits"];
    const result = await new Promise<Record<string, unknown[]>>((resolve, reject) => {
      const tx = db.transaction([...names, "v3_legacy", "v3_sessions", "v3_records"], "readonly");
      const all: Record<string, unknown[]> = {};
      for (const name of [...names, "v3_legacy", "v3_sessions", "v3_records"]) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => { all[name] = request.result; };
      }
      tx.oncomplete = () => resolve(all);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return result;
  });
}

test("v2 upgrade quarantines every store and sensitive layout without deleting historical records", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async (names) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 2);
      request.onupgradeneeded = () => {
        for (const name of names) {
          request.result.createObjectStore(name, {
            keyPath: name === "workspaces" || name === "commits" ? "id" : "key",
          });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(names, "readwrite");
      const legacyId = "acme/private@main";
      tx.objectStore("workspaces").put({
        version: 2, id: legacyId, repository: {
          id: 42, name: "private", fullName: "acme/private", owner: "acme",
          private: true, defaultBranch: "main", htmlUrl: "https://github.com/acme/private",
          canPush: true,
        },
        ref: "main", baseSha: "baseline", treeSha: "tree",
        tree: [], updatedAt: 1,
      });
      tx.objectStore("blobs").put({
        key: legacyId + ":sha", workspaceId: legacyId, sha: "sha",
        content: "PRIVATE_BLOB", updatedAt: 1,
      });
      tx.objectStore("overlays").put({
        key: legacyId + ":file", workspaceId: legacyId, path: "file",
        content: "PRIVATE_OVERLAY", status: "modified", updatedAt: 1,
      });
      tx.objectStore("staged").put({
        key: legacyId + ":file", workspaceId: legacyId, path: "file",
        content: "PRIVATE_STAGED", status: "modified", stagedAt: 1, updatedAt: 1,
      });
      tx.objectStore("committed").put({
        key: legacyId + ":file", workspaceId: legacyId, path: "file",
        content: "PRIVATE_COMMITTED", deleted: false, updatedAt: 1,
      });
      tx.objectStore("commits").put({
        id: legacyId + ":local:1:fixture", workspaceId: legacyId,
        message: "PRIVATE_COMMIT", createdAt: 1, files: [],
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem("workbench-layout-v2", "PRIVATE_LAYOUT_DATA");
    localStorage.setItem("workbench-recent-workspaces-v1", "PRIVATE_RECENTS");
  }, LEGACY);

  await installGithubMock(page);
  await page.reload();
  await openPublic(page);
  const state = await readV3(page);
  for (const name of LEGACY) expect(state[name]).toHaveLength(1);
  const quarantine = state.v3_legacy as Array<{ id: string; value: unknown }>;
  for (const name of LEGACY)
    expect(quarantine.some((item) => item.id.startsWith("idb:" + name + ":"))).toBe(true);
  expect(quarantine.find((record) => record.id === "local:workbench-layout-v2")?.value)
    .toBe("PRIVATE_LAYOUT_DATA");
  expect(quarantine.find((record) => record.id === "local:workbench-recent-workspaces-v1")?.value)
    .toBe("PRIVATE_RECENTS");
  expect(state.v3_sessions).toHaveLength(1);
  expect((state.v3_sessions[0] as { principalKey: string }).principalKey).toMatch(/^anon:/);
  expect((state.v3_records as Array<{ value?: { content?: string } }>).some(
    (row) => row.value?.content === "PRIVATE_BLOB" || row.value?.content === "PRIVATE_OVERLAY",
  )).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("workbench-layout-v2")))
    .toBe("PRIVATE_LAYOUT_DATA");
});

test("a requested v3 overlay write that aborts after request success does not persist", async ({
  page,
}) => {
  await page.goto("/");
  await installGithubMock(page);
  await page.evaluate(() => {
    sessionStorage.setItem("workbench-github-token", JSON.stringify({ token: "test-token" }));
  });
  await page.reload();
  await expect(page.getByTitle("Sign out")).toBeVisible();
  await page.getByRole("button", { name: /Open Repository/ }).first().click();
  await page.getByRole("textbox", { name: "Repository" }).fill(MOCK_REPOSITORY);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".workspace-repository-button")).toContainText(MOCK_REPOSITORY);
  await page.locator('[data-workbench-surface="primary"] .dv-tab')
    .filter({ hasText: "Explorer" }).click();
  await page.locator('[data-workbench-surface="primary"]').getByTitle("README.md").click();
  await expect(page.locator(".monaco-editor")).toBeVisible();

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let abortNextOverlay = true;
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      if (this.name === "v3_records" &&
          (args[0] as { kind?: string }).kind === "overlay" && abortNextOverlay) {
        abortNextOverlay = false;
        request.addEventListener("success", () => this.transaction.abort(), { once: true });
      }
      return request;
    };
  });

  await page.locator(".monaco-editor").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("UNACKNOWLEDGED_BUFFER");
  await page.waitForTimeout(500);
  const state = await readV3(page);
  expect((state.v3_records as Array<{ kind: string; value: { content?: string } }>).some(
    (record) => record.kind === "overlay" && record.value.content === "UNACKNOWLEDGED_BUFFER",
  )).toBe(false);
});
