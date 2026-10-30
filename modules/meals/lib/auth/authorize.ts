import { queryOne } from "@meals/lib/db";
import { envAuthEmails } from "@meals/lib/auth/env-users";
import { getEnvSafe } from "@meals/lib/env";
import { isEmailAllowed, normalizeEmail, parseAllowedEmails } from "@meals/lib/utils";

/** Allowlist from AUTH_USERS (or legacy ALLOWED_EMAILS) OR active membership. */
export async function isEmailAuthorized(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const env = getEnvSafe();
  if (!env) return false;

  const allowed = [
    ...new Set([
      ...envAuthEmails(env.AUTH_USERS),
      ...parseAllowedEmails(env.ALLOWED_EMAILS),
    ]),
  ];
  if (isEmailAllowed(normalized, allowed)) return true;

  const profile = await queryOne<{ id: string }>`
    SELECT id FROM profiles WHERE lower(email) = ${normalized} LIMIT 1
  `;
  if (!profile) return false;

  const membership = await queryOne<{ id: string }>`
    SELECT id FROM household_members
    WHERE user_id = ${profile.id} AND is_active = true
    LIMIT 1
  `;
  return Boolean(membership);
}

export async function isAuthenticatedUserAuthorized(user: {
  id: string;
  email?: string | null;
}): Promise<boolean> {
  const env = getEnvSafe();
  if (!env) return false;

  if (user.email) {
    const allowed = [
      ...new Set([
        ...envAuthEmails(env.AUTH_USERS),
        ...parseAllowedEmails(env.ALLOWED_EMAILS),
      ]),
    ];
    if (isEmailAllowed(user.email, allowed)) return true;
  }

  const membership = await queryOne<{ id: string }>`
    SELECT id FROM household_members
    WHERE user_id = ${user.id} AND is_active = true
    LIMIT 1
  `;
  return Boolean(membership);
}
