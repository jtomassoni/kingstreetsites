import { describe, expect, it } from "vitest";
import { isEmailAllowed, normalizeEmail, parseAllowedEmails } from "@meals/lib/utils";

describe("household auth helpers", () => {
  it("normalizes and checks allowlist", () => {
    const allowed = parseAllowedEmails(" JT@Example.com , mary@example.com ");
    expect(allowed).toEqual(["jt@example.com", "mary@example.com"]);
    expect(isEmailAllowed("JT@example.com", allowed)).toBe(true);
    expect(isEmailAllowed("other@example.com", allowed)).toBe(false);
    expect(normalizeEmail("  A@B.C ")).toBe("a@b.c");
  });
});
