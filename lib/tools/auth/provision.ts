import { createHash } from "crypto";
import { normalizeEmail } from "@/lib/tools/auth/env-users";

/**
 * Stable placeholder id when the meals database is not configured.
 * When MEALS_DATABASE_URL is set, login provisions the real Neon profile id.
 */
export function stableToolsUserId(email: string): string {
  const h = createHash("sha256")
    .update(`kss-tools:${normalizeEmail(email)}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Meals Neon URL — never the CRM DATABASE_URL unless explicitly opted in. */
export function mealsDatabaseUrl(): string | undefined {
  const dedicated = process.env.MEALS_DATABASE_URL?.trim();
  if (dedicated) return dedicated;
  if (process.env.MEALS_USE_DATABASE_URL === "1") {
    return process.env.DATABASE_URL?.trim() || undefined;
  }
  return undefined;
}
