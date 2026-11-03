import { describe, expect, test } from "bun:test";
import { bindStoragePrincipal, saveWorkspace } from "../../src/workspace/storage";
import type { WorkspaceSnapshot } from "../../src/workspace/model";

const principal = "gh:github.com:1001" as const;
const sessionId = "4a333080-117b-4a5c-9e12-151bf90184de";
const workspaceId = "203c58bb-1336-4d74-bfd9-b5f81d08bf92";
const id = `ghcode-owned-v2:${encodeURIComponent(principal)}:${sessionId}`;

function fixture(): WorkspaceSnapshot {
  return {
    version: 2, id, updatedAt: 1, baseSha: "a", treeSha: "b", tree: [], ref: "main",
    repository: {
      id: 42, name: "private", fullName: "acme/private", owner: "acme",
      private: true, defaultBranch: "main", htmlUrl: "", canPush: true,
    },
    ownership: {
      principalKey: principal,
      workspace: { id: workspaceId, principalKey: principal },
      session: {
        id: sessionId, workspaceId, principalKey: principal,
        repositoryKey: "gh:github.com:repo:42", ref: "refs/heads/main",
      },
    },
  };
}

type Behavior = "hold" | "abort";
function fakeIndexedDB(behavior: Behavior) {
  const original = globalThis.indexedDB;
  let notifyRequest!: () => void;
  const requestDone = new Promise<void>((resolve) => { notifyRequest = resolve; });
  let finish!: () => void;
  let abort!: () => void;
  const database = {
    close() {},
    transaction() {
      const tx: {
        oncomplete?: () => void;
        onabort?: () => void;
        onerror?: () => void;
        error: Error | null;
        abort: () => void;
        objectStore: () => { put: () => unknown };
      } = {
        error: null,
        abort() { tx.error = new Error("AbortError"); tx.onabort?.(); },
        objectStore() {
          return {
            put() {
              const operation: { result?: string; onsuccess?: () => void; onerror?: () => void } = {};
              queueMicrotask(() => {
                operation.result = "saved";
                operation.onsuccess?.();
                notifyRequest();
                if (behavior === "abort") queueMicrotask(() => tx.abort());
              });
              return operation;
            },
          };
        },
      };
      finish = () => tx.oncomplete?.();
      abort = () => tx.abort();
      return tx;
    },
  };
  globalThis.indexedDB = {
    open() {
      const request: { result?: typeof database; onsuccess?: () => void; onerror?: () => void } = {};
      queueMicrotask(() => { request.result = database; request.onsuccess?.(); });
      return request;
    },
  } as unknown as IDBFactory;
  return { requestDone, complete: () => finish(), abort: () => abort(), restore: () => { globalThis.indexedDB = original; } };
}

describe("GHC-02 storage transaction and identity hardening", () => {
  test("a request success does not acknowledge an aborted transaction", async () => {
    bindStoragePrincipal(principal);
    const fake = fakeIndexedDB("abort");
    try {
      await expect(saveWorkspace(fixture())).rejects.toThrow("AbortError");
    } finally { fake.restore(); }
  });

  test("a successful write stays pending until the transaction commits", async () => {
    bindStoragePrincipal(principal);
    const fake = fakeIndexedDB("hold");
    try {
      let settled = false;
      const pending = saveWorkspace(fixture()).then(() => { settled = true; });
      await fake.requestDone;
      await Promise.resolve();
      expect(settled).toBe(false);
      fake.complete();
      await pending;
      expect(settled).toBe(true);
    } finally { fake.restore(); }
  });

  test("another principal cannot use a valid workspace ID from account A", () => {
    bindStoragePrincipal("gh:github.com:2002");
    expect(() => saveWorkspace(fixture())).toThrow(/verified principal/);
    bindStoragePrincipal(principal);
  });
});
