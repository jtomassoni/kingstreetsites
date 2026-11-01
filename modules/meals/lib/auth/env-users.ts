import {
  normalizeEmail,
  parseAuthUsers,
  parseNamedLoginPairs,
  type ToolsAuthUser,
} from "@/lib/tools/auth/env-users";
import {
  findSignInUser,
  getSignInUsers,
} from "@/lib/tools/auth/roles";

export {
  parseAuthUsers,
  parseNamedLoginPairs,
  normalizeEmail,
  type ToolsAuthUser as EnvAuthUser,
} from "@/lib/tools/auth/env-users";

type EnvLike = Record<string, string | undefined>;

function mergeUsers(users: ToolsAuthUser[]): ToolsAuthUser[] {
  const byEmail = new Map<string, ToolsAuthUser>();
  for (const user of users) {
    if (!byEmail.has(user.email)) byEmail.set(user.email, user);
  }
  return [...byEmail.values()];
}

/**
 * Meals-compatible allowlist helper.
 * Accepts a raw `email:password,…` string (from getEnv) or an env object.
 */
export function getEnvAuthUsers(
  rawOrEnv?: string | null | EnvLike,
  env: EnvLike = process.env,
): ToolsAuthUser[] {
  if (typeof rawOrEnv === "object" && rawOrEnv !== null) {
    return getSignInUsers(rawOrEnv);
  }
  if (typeof rawOrEnv === "string" && rawOrEnv.trim()) {
    return mergeUsers([
      ...parseAuthUsers(rawOrEnv),
      ...parseNamedLoginPairs(env),
    ]);
  }
  return getSignInUsers(env);
}

export function findEnvAuthUser(
  email: string,
  password: string,
  raw?: string | null,
  env: EnvLike = process.env,
): ToolsAuthUser | null {
  if (raw?.trim()) {
    const normalized = normalizeEmail(email);
    const match = getEnvAuthUsers(raw, env).find((u) => u.email === normalized);
    if (!match || match.password !== password) return null;
    return match;
  }
  return findSignInUser(email, password, env);
}

export function envAuthEmails(
  rawOrEnv?: string | null | EnvLike,
  env?: EnvLike,
): string[] {
  return getEnvAuthUsers(rawOrEnv, env).map((u) => u.email);
}

/** Combined allowlist string for meals env schema validation. */
export function mealsAuthUsersRaw(): string {
  if (process.env.SUPER_ADMIN_USERS || process.env.APP_USERS) {
    return [process.env.SUPER_ADMIN_USERS, process.env.APP_USERS]
      .filter(Boolean)
      .join(",");
  }
  return process.env.TOOLS_AUTH_USERS || process.env.AUTH_USERS || "";
}
