/**
 * Tools allowlist — same format as Meal Planner.
 * Prefer TOOLS_AUTH_USERS; fall back to AUTH_USERS for migration.
 *
 * Format: email:password,email:password
 * Passwords must not contain commas. First colon separates email/password.
 */

export type ToolsAuthUser = {
  email: string;
  password: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseAuthUsers(raw: string | undefined | null): ToolsAuthUser[] {
  if (!raw?.trim()) return [];

  const users: ToolsAuthUser[] = [];
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const colon = entry.indexOf(":");
    if (colon <= 0) continue;
    const email = normalizeEmail(entry.slice(0, colon));
    const password = entry.slice(colon + 1);
    if (!email || !password) continue;
    users.push({ email, password });
  }
  return users;
}

type EnvLike = Record<string, string | undefined>;

/** DEV_LOGIN_EMAIL/PASSWORD, MARY_LOGIN_EMAIL/PASSWORD, etc. */
export function parseNamedLoginPairs(env: EnvLike = process.env): ToolsAuthUser[] {
  const users: ToolsAuthUser[] = [];
  const seen = new Set<string>();

  for (const [key, emailRaw] of Object.entries(env)) {
    const match = key.match(/^([A-Z0-9_]+)_LOGIN_EMAIL$/);
    if (!match) continue;
    const prefix = match[1];
    const email = normalizeEmail(emailRaw ?? "");
    const password = env[`${prefix}_LOGIN_PASSWORD`] ?? "";
    if (!email || !password) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    users.push({ email, password });
  }

  return users;
}

export function toolsAuthUsersRaw(env: EnvLike = process.env): string | undefined {
  return env.TOOLS_AUTH_USERS || env.AUTH_USERS;
}

export function getToolsAuthUsers(
  rawOrEnv?: string | null | EnvLike,
  env: EnvLike = process.env,
): ToolsAuthUser[] {
  const raw =
    typeof rawOrEnv === "string" || rawOrEnv == null
      ? (rawOrEnv ?? toolsAuthUsersRaw(env))
      : toolsAuthUsersRaw(rawOrEnv);
  const envObj =
    typeof rawOrEnv === "object" && rawOrEnv !== null ? rawOrEnv : env;
  const fromList = parseAuthUsers(raw);
  const fromPairs = parseNamedLoginPairs(envObj);
  const byEmail = new Map<string, ToolsAuthUser>();
  for (const user of [...fromList, ...fromPairs]) {
    if (!byEmail.has(user.email)) byEmail.set(user.email, user);
  }
  return [...byEmail.values()];
}

export function findToolsAuthUser(
  email: string,
  password: string,
  raw?: string | undefined | null,
  env: EnvLike = process.env,
): ToolsAuthUser | null {
  const normalized = normalizeEmail(email);
  const match = getToolsAuthUsers(raw, env).find((u) => u.email === normalized);
  if (!match || match.password !== password) return null;
  return match;
}

export function toolsAuthEmails(
  rawOrEnv?: string | null | EnvLike,
  env?: EnvLike,
): string[] {
  return getToolsAuthUsers(rawOrEnv, env).map((u) => u.email);
}
