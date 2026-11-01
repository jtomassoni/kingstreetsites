/**
 * Household app roles (env-based).
 *
 * SUPER_ADMIN_USERS — full access: all tools + Business CRM (/admin)
 * APP_USERS         — household tools only (no CRM)
 *
 * Format for both: email:password,email:password
 * Passwords must not contain commas. First colon separates email/password.
 *
 * Legacy fallbacks: TOOLS_AUTH_USERS, CRM_AUTH_USERS, AUTH_USERS, ADMIN_EMAIL
 */

import {
  normalizeEmail,
  parseAuthUsers,
  parseNamedLoginPairs,
  type ToolsAuthUser,
} from "@/lib/tools/auth/env-users";

type EnvLike = Record<string, string | undefined>;

export type AppRole = "super_admin" | "app_user";

function mergeUsers(users: ToolsAuthUser[]): ToolsAuthUser[] {
  const byEmail = new Map<string, ToolsAuthUser>();
  for (const user of users) {
    if (!byEmail.has(user.email)) byEmail.set(user.email, user);
  }
  return [...byEmail.values()];
}

export function getSuperAdminUsers(env: EnvLike = process.env): ToolsAuthUser[] {
  const primary = parseAuthUsers(env.SUPER_ADMIN_USERS);
  if (primary.length) return primary;

  // Legacy: CRM_AUTH_USERS listed who could open CRM
  const fromCrm = parseAuthUsers(env.CRM_AUTH_USERS);
  if (fromCrm.length) return fromCrm;

  const adminEmail = normalizeEmail(env.ADMIN_EMAIL ?? "");
  const adminPassword = env.ADMIN_PASSWORD ?? "";
  if (adminEmail && adminPassword) {
    return [{ email: adminEmail, password: adminPassword }];
  }
  return [];
}

export function getAppUsers(env: EnvLike = process.env): ToolsAuthUser[] {
  const primary = parseAuthUsers(env.APP_USERS);
  if (primary.length) return primary;

  // Legacy single list (James + Mary together)
  const legacy = parseAuthUsers(env.TOOLS_AUTH_USERS || env.AUTH_USERS);
  if (legacy.length) {
    const superEmails = new Set(getSuperAdminUsers(env).map((u) => u.email));
    return legacy.filter((u) => !superEmails.has(u.email));
  }
  return [];
}

/** Everyone who may sign in (super admins ∪ app users ∪ named *_LOGIN_* pairs). */
export function getSignInUsers(env: EnvLike = process.env): ToolsAuthUser[] {
  return mergeUsers([
    ...getSuperAdminUsers(env),
    ...getAppUsers(env),
    ...parseNamedLoginPairs(env),
    // If only legacy TOOLS_AUTH_USERS is set (no SUPER/APP split), include it fully
    ...parseAuthUsers(env.TOOLS_AUTH_USERS || env.AUTH_USERS),
  ]);
}

export function findSignInUser(
  email: string,
  password: string,
  env: EnvLike = process.env,
): ToolsAuthUser | null {
  const normalized = normalizeEmail(email);
  const match = getSignInUsers(env).find((u) => u.email === normalized);
  if (!match || match.password !== password) return null;
  return match;
}

export function signInEmails(env: EnvLike = process.env): string[] {
  return getSignInUsers(env).map((u) => u.email);
}

export function superAdminEmails(env: EnvLike = process.env): string[] {
  const emails = new Set(getSuperAdminUsers(env).map((u) => u.email));
  // Legacy ADMIN_EMAIL alone still counts as super admin for CRM gate
  const admin = normalizeEmail(env.ADMIN_EMAIL ?? env.CONTACT_TO_EMAIL ?? "");
  if (admin) emails.add(admin);
  // Legacy CRM_AUTH_USERS email-only lists
  if (!getSuperAdminUsers(env).length && env.CRM_AUTH_USERS?.trim()) {
    for (const part of env.CRM_AUTH_USERS.split(",")) {
      if (part.includes(":")) continue;
      const email = normalizeEmail(part);
      if (email) emails.add(email);
    }
  }
  return [...emails];
}

export function isSuperAdmin(
  email: string | null | undefined,
  env: EnvLike = process.env,
): boolean {
  if (!email) return false;
  return superAdminEmails(env).includes(normalizeEmail(email));
}

/** @deprecated Prefer isSuperAdmin — CRM access === super admin. */
export function isCrmUser(
  email: string | null | undefined,
  env: EnvLike = process.env,
): boolean {
  return isSuperAdmin(email, env);
}

export function roleForEmail(
  email: string | null | undefined,
  env: EnvLike = process.env,
): AppRole | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  if (!signInEmails(env).includes(normalized)) return null;
  return isSuperAdmin(normalized, env) ? "super_admin" : "app_user";
}

export function isToolsAuthConfigured(env: EnvLike = process.env): boolean {
  const users = getSignInUsers(env);
  const secret = env.TOOLS_SESSION_SECRET || env.SESSION_SECRET || "";
  return users.length > 0 && secret.length >= 16;
}
