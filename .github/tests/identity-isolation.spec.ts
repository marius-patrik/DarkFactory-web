import { expect, test, type Page, type Route } from "@playwright/test";
import { installGithubMock, MOCK_REPOSITORY, PUBLIC_REPOSITORY } from "./github-mock";

const A_ID = 1001;
const B_ID = 2002;

async function setup(page: Page, options: { denyB?: boolean; invalidId?: unknown } = {}) {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await installGithubMock(page);
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    const authorization = route.request().headers().authorization ?? "";
    if (url.pathname === "/user") {
      const id = Object.hasOwn(options, "invalidId") ? options.invalidId : (authorization.includes("token-b") ? B_ID : A_ID);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id, login: "same-login",
          avatar_url: "https://avatars.example/user.png",
          html_url: "https://github.com/same-login",
        }),
      });
    }
    if (options.denyB && authorization.includes("token-b") &&
        url.pathname.startsWith(`/repos/${MOCK_REPOSITORY}`)) {
      return route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"Not Found"}' });
    }
    await route.fallback();
  });
  await page.reload();
}

async function authenticate(page: Page, token: "token-a" | "token-b") {
  await page.evaluate((value) =>
    sessionStorage.setItem("workbench-github-token", JSON.stringify({ token: value })), token);
  await page.reload();
  await expect(page.getByTitle("Sign out")).toContainText("same-login");
}

async function openRepository(page: Page, name: string = MOCK_REPOSITORY) {
  await page.getByRole("button", { name: /Open Repository/ }).first().click();
  await page.getByRole("textbox", { name: "Repository" }).fill(name);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".workspace-repository-button")).toContainText(name);
}

async function openDialog(page: Page) {
  await page.getByRole("button", { name: /Open Repository/ }).first().click();
}

test("A private repository is not accessible to anonymous or denied account B", async ({ page }) => {
  await setup(page, { denyB: true });
  await authenticate(page, "token-a");
  await openRepository(page);
  await page.getByTitle("Sign out").click();
  await expect(page.locator(".workspace-repository-button")).toContainText("Open Repository");
  await expect(page.getByTitle("Sign in with GitHub")).toBeVisible();
  await openDialog(page);
  await expect(page.getByText("Recent Workspaces")).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await authenticate(page, "token-b");
  await openDialog(page);
  await expect(page.getByText("Recent Workspaces")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Repository" }).fill(MOCK_REPOSITORY);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText(/Not Found/).first()).toBeVisible();
  await expect(page.locator(".workspace-repository-button")).toContainText("Open Repository");
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("same repository and login are isolated by immutable numeric user ID", async ({ page }) => {
  await setup(page);
  await authenticate(page, "token-a");
  await openRepository(page);
  const aIds = await page.evaluate(async () => {
    return new Promise<string[]>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("workspaces", "readonly");
        const query = tx.objectStore("workspaces").getAllKeys();
        query.onsuccess = () => { resolve(query.result.map(String)); db.close(); };
      };
    });
  });
  expect(aIds.some((id) => id.includes(encodeURIComponent(`gh:github.com:${A_ID}`)))).toBe(true);
  await page.getByTitle("Sign out").click();
  await authenticate(page, "token-b");
  await openRepository(page);
  const keys = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return await new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction("workspaces", "readonly");
      const request = tx.objectStore("workspaces").getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { resolve(request.result.map(String)); db.close(); };
    });
  });
  expect(keys.some((key) => key.includes(encodeURIComponent(`gh:github.com:${A_ID}`)))).toBe(true);
  expect(keys.some((key) => key.includes(encodeURIComponent(`gh:github.com:${B_ID}`)))).toBe(true);
  expect(keys.length).toBeGreaterThanOrEqual(2);
});

test("unverified and missing numeric /user identity fails closed", async ({ page }) => {
  await setup(page, { invalidId: "same-login" });
  await authenticateWithInvalidResponse(page);
  await expect(page.getByTitle("Sign in with GitHub")).toBeVisible();
  await openDialog(page);
  await expect(page.getByText(/numeric ID/).first()).toBeVisible();
  await expect(page.getByText("Recent Workspaces")).toHaveCount(0);
});

async function authenticateWithInvalidResponse(page: Page) {
  await page.evaluate(() =>
    sessionStorage.setItem("workbench-github-token", JSON.stringify({ token: "token-invalid" })));
  await page.reload();
  await expect(page.getByTitle("Sign in with GitHub")).toBeVisible();
}

test("missing user ID fails closed, not just explicitly invalid ID", async ({ page }) => {
  await setup(page, { invalidId: null });
  await authenticateWithInvalidResponse(page);
  await openDialog(page);
  await expect(page.getByText(/numeric ID/).first()).toBeVisible();
});

test("sign-out fences delayed repository responses", async ({ page }) => {
  await setup(page);
  await authenticate(page, "token-a");
  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let started: () => void = () => {};
  const hit = new Promise<void>((resolve) => { started = resolve; });
  await page.route(`https://api.github.com/repos/${MOCK_REPOSITORY}/commits/main`, async (route: Route) => {
    started();
    await hold;
    await route.fallback();
  });
  await openDialog(page);
  await page.getByRole("textbox", { name: "Repository" }).fill(MOCK_REPOSITORY);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await hit;
  await page.getByTitle("Sign out").click();
  release();
  await expect(page.locator(".workspace-repository-button")).toContainText("Open Repository");
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("legacy unattributed cache and layout remain intact but cannot render", async ({ page }) => {
  await setup(page);
  await openRepository(page, PUBLIC_REPOSITORY);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const historical = {
      version: 2, id: "acme/private@main",
      repository: {
        id: 42, name: "private", fullName: "acme/private", owner: "acme", private: true,
        defaultBranch: "main", htmlUrl: "https://github.com/acme/private", canPush: true,
      },
      ref: "main", baseSha: "a", treeSha: "b", tree: [], updatedAt: 1,
    };
    const tx = database.transaction("workspaces", "readwrite");
    tx.objectStore("workspaces").put(historical);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
    localStorage.setItem("workbench-recent-workspaces-v1", JSON.stringify([historical]));
    localStorage.setItem("workbench-layout-v2", JSON.stringify({
      version: 2, surfaces: { main: { visible: true, layout: { privateText: "LEGACY_PRIVATE_SENTINEL" } } },
    }));
  });
  await page.reload();
  await expect(page.locator(".workspace-repository-button")).toContainText("Open Repository");
  await openDialog(page);
  await expect(page.getByText("Recent Workspaces")).toBeVisible();
  await expect(page.getByText(MOCK_REPOSITORY, { exact: true })).toHaveCount(0);
  await expect(page.getByText("LEGACY_PRIVATE_SENTINEL")).toHaveCount(0);
  const legacy = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("darkfactory-workbench", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const tx = database.transaction("workspaces", "readonly");
    const request = tx.objectStore("workspaces").get("acme/private@main");
    return await new Promise<{ exists: boolean; recents: string | null; layout: string | null }>((resolve) => {
      request.onsuccess = () => {
        resolve({
          exists: !!request.result,
          recents: localStorage.getItem("workbench-recent-workspaces-v1"),
          layout: localStorage.getItem("workbench-layout-v2"),
        });
        database.close();
      };
    });
  });
  expect(legacy.exists).toBe(true);
  expect(legacy.recents).toContain("acme/private@main");
  expect(legacy.layout).toContain("LEGACY_PRIVATE_SENTINEL");
});

test("different anonymous profiles never read one another's workspaces", async ({ page }) => {
  await setup(page);
  await openRepository(page, PUBLIC_REPOSITORY);
  const a = await page.evaluate(() => localStorage.getItem("ghcode-anonymous-profile-v1"));
  await page.evaluate(() => localStorage.setItem("ghcode-anonymous-profile-v1", crypto.randomUUID()));
  await page.reload();
  const b = await page.evaluate(() => localStorage.getItem("ghcode-anonymous-profile-v1"));
  expect(a).not.toBe(b);
  await openDialog(page);
  await expect(page.getByText("Recent Workspaces")).toHaveCount(0);
});
