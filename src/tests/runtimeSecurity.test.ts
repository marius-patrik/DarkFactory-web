import { expect, test } from "bun:test";
import { lookupHandler } from "@/server/api";
import { BrowserFrameService } from "@/server/browserService";
import { isBrowserInteractionMessage, isTrustedLocalRequest } from "@/server/server";
import type { BrowserSession } from "@/shared/schema";

function localRequest(host: string, origin?: string): Request {
  return new Request("http://127.0.0.1:4567/api/fs.delete", {
    headers: { host, ...(origin ? { origin } : {}) },
  });
}

test("strict loopback host and origin gate rejects sibling-site and rebinding requests", () => {
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:4567"), 4567)).toBe(true);
  expect(isTrustedLocalRequest(localRequest("localhost:4567", "http://localhost:4567"), 4567)).toBe(true);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:4567", "http://localhost:3000"), 4567)).toBe(false);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:4567", "https://localhost:4567"), 4567)).toBe(false);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:4567", "http://localhost:4567/path"), 4567)).toBe(false);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:4567", "null"), 4567)).toBe(false);
  expect(isTrustedLocalRequest(localRequest("attacker.invalid:4567"), 4567)).toBe(false);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1.attacker.invalid:4567"), 4567)).toBe(false);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:7000"), 4567)).toBe(false);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:4567", "http://localhost:7000"), 4567, 7000)).toBe(true);
  expect(isTrustedLocalRequest(localRequest("127.0.0.1:7000", "http://localhost:7000"), 4567, 7000)).toBe(true);
});

test("API lookup never crosses into Object or Function prototypes", () => {
  expect(typeof lookupHandler("workspace.list")).toBe("function");
  for (const path of ["constructor", "toString", "__proto__", "fs.__proto__", "fs.tree.constructor"]) {
    expect(lookupHandler(path)).toBeNull();
  }
});

test("browser interaction payloads reject non-finite coordinates and unbounded text", () => {
  expect(isBrowserInteractionMessage({ type: "viewport", width: 800, height: 600 })).toBe(true);
  expect(isBrowserInteractionMessage({ type: "viewport", width: Number.POSITIVE_INFINITY, height: 600 })).toBe(false);
  expect(isBrowserInteractionMessage({ type: "viewport", width: -1, height: 600 })).toBe(false);
  expect(isBrowserInteractionMessage({ type: "mouse", event: "down", x: Number.NaN, y: 3 })).toBe(false);
  expect(isBrowserInteractionMessage({ type: "wheel", x: 0, y: 0, deltaX: Number.POSITIVE_INFINITY, deltaY: 0 })).toBe(false);
  expect(isBrowserInteractionMessage({ type: "paste", text: "x".repeat(65_537) })).toBe(false);
  expect(isBrowserInteractionMessage({ type: "paste", text: "hello" })).toBe(true);
  expect(isBrowserInteractionMessage({ type: "chooseFiles", files: [{ name: "x", mimeType: "text/plain", data: "a".repeat(8_000_001) }] })).toBe(false);
});

test("Chromium refuses persistence outside the designated browser profile root", async () => {
  const root = "/tmp/rscode-test-profiles";
  const session: BrowserSession = {
    workspaceId: "..",
    paneId: "..",
    url: "about:blank",
    title: "Browser",
    canGoBack: false,
    canGoForward: false,
    profilePath: "/tmp/rscode-external-profile",
  };
  const service = new BrowserFrameService(root, () => undefined);
  try {
    await expect(service.stream(session, { send: () => undefined }))
      .rejects.toThrow("browser profile is outside");
  } finally {
    await service.close();
  }
});
