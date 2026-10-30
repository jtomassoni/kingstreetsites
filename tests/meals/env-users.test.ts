import { describe, expect, it } from "vitest";
import {
  findEnvAuthUser,
  getEnvAuthUsers,
  parseAuthUsers,
  parseNamedLoginPairs,
} from "@meals/lib/auth/env-users";

describe("parseAuthUsers", () => {
  it("parses email:password pairs", () => {
    expect(
      parseAuthUsers("jt@example.com:secret1,mary@example.com:secret2"),
    ).toEqual([
      { email: "jt@example.com", password: "secret1" },
      { email: "mary@example.com", password: "secret2" },
    ]);
  });

  it("normalizes email and keeps password after first colon", () => {
    expect(parseAuthUsers("JT@Example.COM:p:ass:word")).toEqual([
      { email: "jt@example.com", password: "p:ass:word" },
    ]);
  });

  it("skips malformed entries", () => {
    expect(parseAuthUsers("nocolon,:@empty,:onlypass")).toEqual([]);
  });
});

describe("parseNamedLoginPairs", () => {
  it("reads DEV_LOGIN_* and MARY_LOGIN_*", () => {
    expect(
      parseNamedLoginPairs({
        DEV_LOGIN_EMAIL: "jt@example.com",
        DEV_LOGIN_PASSWORD: "secret1",
        MARY_LOGIN_EMAIL: "mary@example.com",
        MARY_LOGIN_PASSWORD: "secret2",
      }),
    ).toEqual([
      { email: "jt@example.com", password: "secret1" },
      { email: "mary@example.com", password: "secret2" },
    ]);
  });
});

describe("getEnvAuthUsers", () => {
  it("merges AUTH_USERS and named pairs without duplicates", () => {
    const users = getEnvAuthUsers("jt@example.com:from-list", {
      DEV_LOGIN_EMAIL: "jt@example.com",
      DEV_LOGIN_PASSWORD: "ignored-dup",
      MARY_LOGIN_EMAIL: "mary@example.com",
      MARY_LOGIN_PASSWORD: "secret2",
    });
    expect(users).toEqual([
      { email: "jt@example.com", password: "from-list" },
      { email: "mary@example.com", password: "secret2" },
    ]);
  });
});

describe("findEnvAuthUser", () => {
  const raw = "jt@example.com:secret1,mary@example.com:secret2";

  it("matches email + password", () => {
    expect(findEnvAuthUser("JT@example.com", "secret1", raw, {})?.email).toBe(
      "jt@example.com",
    );
  });

  it("rejects wrong password", () => {
    expect(findEnvAuthUser("jt@example.com", "nope", raw, {})).toBeNull();
  });
});
