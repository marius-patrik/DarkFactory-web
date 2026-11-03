import { describe, expect, test } from "bun:test";
import { DocumentService } from "../../src/workspace/document-service";

const principal = "gh:github.com:1001";
const resource = `ghcode-owned-v2:${encodeURIComponent(principal)}:session:README.md`;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("GHC-03 durable document lifecycle", () => {
  test("does not acknowledge edits until the storage writer completes", async () => {
    const service = new DocumentService();
    const write = deferred();
    service.bindPrincipal(principal);
    service.acquire(resource, principal, "baseline", () => write.promise);
    const pending = service.edit(resource, "new bytes");
    expect(service.snapshot(resource)?.dirty).toBe(true);
    expect(() => service.assertSafeToNavigate()).toThrow(/not durably acknowledged/);
    write.resolve();
    await pending;
    expect(service.snapshot(resource)?.dirty).toBe(false);
    service.assertSafeToNavigate();
  });

  test("concurrent views share one authoritative content revision", async () => {
    const service = new DocumentService();
    const written: string[] = [];
    service.bindPrincipal(principal);
    service.acquire(resource, principal, "old", async (value) => { written.push(value); });
    service.acquire(resource, principal, "stale initial", async (value) => { written.push(value); });
    expect(service.snapshot(resource)?.content).toBe("old");
    await service.edit(resource, "changed");
    expect(written).toEqual(["changed"]);
    service.release(resource);
    expect(service.snapshot(resource)).not.toBeNull();
    service.release(resource);
    expect(service.snapshot(resource)).toBeNull();
  });

  test("serializes concurrent edits and rejects account-switch stale closures", async () => {
    const service = new DocumentService();
    const first = deferred();
    const written: string[] = [];
    service.bindPrincipal(principal);
    service.acquire(resource, principal, "v0", async (value) => {
      written.push(value);
      if (value === "v1") await first.promise;
    });
    const one = service.edit(resource, "v1");
    const two = service.edit(resource, "v2");
    first.resolve();
    await Promise.all([one, two]);
    expect(written).toEqual(["v1", "v2"]);
    service.bindPrincipal("gh:github.com:2002");
    await expect(service.edit(resource, "forged")).rejects.toThrow(/revoked/);
  });

  test("failed write keeps dirty bytes, reports error and allows an explicit retry", async () => {
    const service = new DocumentService();
    let fail = true;
    service.bindPrincipal(principal);
    service.acquire(resource, principal, "before", async () => {
      if (fail) throw new Error("QuotaExceededError");
    });
    await expect(service.edit(resource, "important")).rejects.toThrow(/Quota/);
    expect(service.snapshot(resource)?.dirty).toBe(true);
    expect(service.snapshot(resource)?.error).toContain("Quota");
    expect(() => service.assertSafeToNavigate()).toThrow(/not durably acknowledged/);
    fail = false;
    await service.flush(resource);
    expect(service.snapshot(resource)?.dirty).toBe(false);
  });
});
