import { describe, expect, it } from "vitest";
import { isEasyLoginEnabled } from "@meals/lib/auth/easy-login";

describe("isEasyLoginEnabled", () => {
  it("is true for local development", () => {
    expect(
      isEasyLoginEnabled({
        nodeEnv: "development",
        vercelEnv: undefined,
      }),
    ).toBe(true);
  });

  it("is false on Vercel production", () => {
    expect(
      isEasyLoginEnabled({
        nodeEnv: "production",
        vercelEnv: "production",
      }),
    ).toBe(false);
  });

  it("is false on Vercel preview", () => {
    expect(
      isEasyLoginEnabled({
        nodeEnv: "production",
        vercelEnv: "preview",
      }),
    ).toBe(false);
  });

  it("is false for a local production build", () => {
    expect(
      isEasyLoginEnabled({
        nodeEnv: "production",
        vercelEnv: undefined,
      }),
    ).toBe(false);
  });
});
