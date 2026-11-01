import { expect, test, type Page } from "@playwright/test";
import { installGithubMock, MOCK_REPOSITORY } from "./github-mock";

async function authenticateAndOpen(page: Page) {
  await installGithubMock(page);
  await page.evaluate(() =>
    sessionStorage.setItem("workbench-github-token", JSON.stringify({ token: "test-token" })),
  );
  await page.reload();
  await expect(page.getByTitle("Sign out")).toBeVisible();
  await page.getByRole("button", { name: /Open Repository/ }).first().click();
  await page.getByRole("textbox", { name: "Repository" }).fill(MOCK_REPOSITORY);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".workspace-repository-button")).toContainText(MOCK_REPOSITORY);
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<{
      records: Array<{ kind: string; value: Record<string, unknown> }>;
      legacy: Array<{ id: string; value: unknown }>;
      oldWorkspaces: Array<{ id: string }>;
    }>((resolve, reject) => {
      const tx = db.transaction(["v3_records", "v3_legacy", "workspaces"], "readonly");
      const requests = [
        tx.objectStore("v3_records").getAll(),
        tx.objectStore("v3_legacy").getAll(),
        tx.objectStore("workspaces").getAll(),
      ];
      tx.oncomplete = () => resolve({
        records: requests[0].result,
        legacy: requests[1].result,
        oldWorkspaces: requests[2].result,
      });
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return result;
  });
}

test("v2 private work is attributed only after explicit user confirmation and matching verified repository", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 2);
      request.onupgradeneeded = () => {
        for (const name of ["workspaces", "blobs", "overlays", "staged", "committed", "commits"]) {
          request.result.createObjectStore(name, {
            keyPath: name === "workspaces" || name === "commits" ? "id" : "key",
          });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const id = "acme/private@main";
      const tx = db.transaction(["workspaces", "overlays", "staged"], "readwrite");
      tx.objectStore("workspaces").put({
        id, version: 2, ref: "main", baseSha: "1111111111111111111111111111111111111111",
        treeSha: "2222222222222222222222222222222222222222", updatedAt: 1, tree: [],
        repository: {
          id: 42, name: "private", fullName: "acme/private", owner: "acme",
          private: true, defaultBranch: "main", htmlUrl: "https://github.com/acme/private",
          canPush: true,
        },
      });
      tx.objectStore("overlays").put({
        key: id + ":README.md", workspaceId: id, path: "README.md",
        status: "modified", content: "LEGACY_OVERLAY_SENTINEL", updatedAt: 1,
      });
      tx.objectStore("staged").put({
        key: id + ":README.md", workspaceId: id, path: "README.md",
        status: "modified", content: "LEGACY_STAGED_SENTINEL", stagedAt: 1, updatedAt: 1,
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await authenticateAndOpen(page);
  expect((await records(page)).records.some((row) =>
    row.value.content === "LEGACY_OVERLAY_SENTINEL")).toBe(false);
  await page.getByRole("button", { name: /Open Repository/ }).first().click();
  await page.getByRole("button", { name: "Review unattributed workspaces" }).click();
  const adopt = page.getByRole("button", { name: "Recover into current repository" });
  await expect(adopt).toBeDisabled();
  await page.getByRole("checkbox", { name: /I confirm this legacy workspace belongs to me/ }).check();
  await expect(adopt).toBeEnabled();
  await adopt.click();
  await expect(page.getByRole("dialog", { name: "Open GitHub repository" })).toHaveCount(0);
  const after = await records(page);
  expect(after.records.some((row) => row.kind === "overlay" &&
    row.value.content === "LEGACY_OVERLAY_SENTINEL")).toBe(true);
  expect(after.records.some((row) => row.kind === "staged" &&
    row.value.content === "LEGACY_STAGED_SENTINEL")).toBe(true);
  expect(after.oldWorkspaces.some((row) => row.id === "acme/private@main")).toBe(true);
  expect(after.legacy.some((row) => row.id.startsWith("idb:workspaces:"))).toBe(true);
});

test("an injected commit write failure rolls back committed projection and preserves staged work", async ({
  page,
}) => {
  await page.goto("/");
  await authenticateAndOpen(page);
  await page.locator('[data-workbench-surface="primary"] .dv-tab')
    .filter({ hasText: "Explorer" }).click();
  await page.locator('[data-workbench-surface="primary"]')
    .getByTitle("README.md").click();
  const editor = page.locator('[data-workbench-surface="main"] .monaco-editor').last();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("COMMIT_ROLLBACK_SENTINEL");
  await page.waitForTimeout(500);
  await page.locator('[data-workbench-surface="primary"] .dv-tab')
    .filter({ hasText: "Source Control" }).click();
  const row = page.locator('[data-workbench-surface="primary"] .scm-change-row')
    .filter({ hasText: "README.md" });
  await expect(row).toBeVisible();
  await row.getByTitle("Stage", { exact: true }).click();
  await expect(row.getByTitle("Unstage", { exact: true })).toBeVisible();
  const before = await records(page);
  expect(before.records.some((record) => record.kind === "staged" &&
    record.value.content === "COMMIT_ROLLBACK_SENTINEL")).toBe(true);
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "v3_records" && (args[0] as { kind?: string })?.kind === "commit")
        throw new DOMException("Synthetic commit failure", "QuotaExceededError");
      return originalPut.apply(this, args);
    };
  });
  await page.getByLabel("Commit message").fill("must roll back");
  await page.getByRole("button", { name: /Commit staged/ }).click();
  await page.waitForTimeout(350);
  const after = await records(page);
  expect(after.records.some((record) => record.kind === "commit")).toBe(false);
  expect(after.records.some((record) => record.kind === "committed")).toBe(false);
  expect(after.records.some((record) => record.kind === "staged" &&
    record.value.content === "COMMIT_ROLLBACK_SENTINEL")).toBe(true);
});
