import { describe, expect, it } from "vitest";
import {
  findToolsAuthUser,
  getToolsAuthUsers,
  isToolsAuthConfigured,
  parseAuthUsers,
  toolsAuthEmails,
} from "@/lib/tools/auth/env-users";
import { safeToolsReturnPath } from "@/lib/tools/auth/safe-return";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/tools/auth/rate-limit";

describe("tools auth allowlist", () => {
  it("parses email:password pairs", () => {
    const users = parseAuthUsers(
      "james@example.com:secret1,mary@example.com:secret2",
    );
    expect(users).toEqual([
      { email: "james@example.com", password: "secret1" },
      { email: "mary@example.com", password: "secret2" },
    ]);
  });

  it("prefers TOOLS_AUTH_USERS over AUTH_USERS", () => {
    const env = {
      TOOLS_AUTH_USERS: "a@example.com:one",
      AUTH_USERS: "b@example.com:two",
    };
    expect(getToolsAuthUsers(env).map((u) => u.email)).toEqual([
      "a@example.com",
    ]);
  });

  it("falls back to AUTH_USERS", () => {
    const env = { AUTH_USERS: "mary@example.com:pw" };
    expect(toolsAuthEmails(env)).toEqual(["mary@example.com"]);
  });

  it("validates credentials", () => {
    const env = { AUTH_USERS: "james@example.com:correct" };
    expect(findToolsAuthUser("james@example.com", "correct", undefined, env)).toBeTruthy();
    expect(findToolsAuthUser("james@example.com", "wrong", undefined, env)).toBeNull();
  });

  it("fails closed without secret or users", () => {
    expect(isToolsAuthConfigured({})).toBe(false);
    expect(
      isToolsAuthConfigured({
        AUTH_USERS: "a@b.c:x",
        TOOLS_SESSION_SECRET: "short",
      }),
    ).toBe(false);
    expect(
      isToolsAuthConfigured({
        AUTH_USERS: "a@b.c:x",
        TOOLS_SESSION_SECRET: "sixteen-chars-ok",
      }),
    ).toBe(true);
  });
});

describe("safeToolsReturnPath", () => {
  it("allows only /tools paths", () => {
    expect(safeToolsReturnPath("/tools/meals")).toBe("/tools/meals");
    expect(safeToolsReturnPath("/admin/leads")).toBe("/tools");
    expect(safeToolsReturnPath("https://evil.test/tools")).toBe("/tools");
    expect(safeToolsReturnPath("//evil.test")).toBe("/tools");
    expect(safeToolsReturnPath("/tools/login")).toBe("/tools");
  });
});

describe("login rate limit", () => {
  it("blocks after repeated failures", () => {
    const key = `test-${Date.now()}`;
    clearLoginFailures(key);
    for (let i = 0; i < 10; i++) recordLoginFailure(key);
    expect(checkLoginRateLimit(key).ok).toBe(false);
    clearLoginFailures(key);
    expect(checkLoginRateLimit(key).ok).toBe(true);
  });
});
