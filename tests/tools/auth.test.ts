import { describe, expect, it } from "vitest";
import { parseAuthUsers } from "@/lib/tools/auth/env-users";
import {
  findSignInUser,
  getAppUsers,
  getSignInUsers,
  getSuperAdminUsers,
  isSuperAdmin,
  isToolsAuthConfigured,
  roleForEmail,
  signInEmails,
} from "@/lib/tools/auth/roles";
import { safeToolsReturnPath } from "@/lib/tools/auth/safe-return";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/tools/auth/rate-limit";

describe("role-based users", () => {
  const env = {
    SUPER_ADMIN_USERS: "james@example.com:secret1",
    APP_USERS: "mary@example.com:secret2",
    TOOLS_SESSION_SECRET: "sixteen-chars-ok",
    ADMIN_EMAIL: "",
  };

  it("parses email:password pairs", () => {
    expect(parseAuthUsers(env.SUPER_ADMIN_USERS)).toEqual([
      { email: "james@example.com", password: "secret1" },
    ]);
  });

  it("splits super admin and app user", () => {
    expect(getSuperAdminUsers(env).map((u) => u.email)).toEqual([
      "james@example.com",
    ]);
    expect(getAppUsers(env).map((u) => u.email)).toEqual(["mary@example.com"]);
    expect(signInEmails(env).sort()).toEqual([
      "james@example.com",
      "mary@example.com",
    ]);
  });

  it("gives CRM only to super admin", () => {
    expect(isSuperAdmin("james@example.com", env)).toBe(true);
    expect(isSuperAdmin("mary@example.com", env)).toBe(false);
    expect(roleForEmail("james@example.com", env)).toBe("super_admin");
    expect(roleForEmail("mary@example.com", env)).toBe("app_user");
  });

  it("validates credentials across both lists", () => {
    expect(findSignInUser("james@example.com", "secret1", env)).toBeTruthy();
    expect(findSignInUser("mary@example.com", "secret2", env)).toBeTruthy();
    expect(findSignInUser("mary@example.com", "wrong", env)).toBeNull();
  });

  it("fails closed without secret or users", () => {
    expect(isToolsAuthConfigured({})).toBe(false);
    expect(
      isToolsAuthConfigured({
        APP_USERS: "a@b.c:x",
        TOOLS_SESSION_SECRET: "short",
      }),
    ).toBe(false);
    expect(isToolsAuthConfigured(env)).toBe(true);
  });

  it("falls back to legacy TOOLS_AUTH_USERS + CRM_AUTH_USERS", () => {
    const legacy = {
      TOOLS_AUTH_USERS: "james@example.com:a,mary@example.com:b",
      CRM_AUTH_USERS: "james@example.com:a",
      ADMIN_EMAIL: "",
      TOOLS_SESSION_SECRET: "sixteen-chars-ok",
    };
    expect(getSignInUsers(legacy).map((u) => u.email).sort()).toEqual([
      "james@example.com",
      "mary@example.com",
    ]);
    expect(isSuperAdmin("james@example.com", legacy)).toBe(true);
    expect(isSuperAdmin("mary@example.com", legacy)).toBe(false);
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
