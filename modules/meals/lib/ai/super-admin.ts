import { envAuthEmails } from "@meals/lib/auth/env-users";
import { normalizeEmail } from "@meals/lib/utils";

export function resolveSuperAdminEmail(input: {
  superAdminEmail?: string;
  authUsers?: string;
}): string | null {
  const configured = normalizeEmail(input.superAdminEmail ?? "");
  if (configured) return configured;
  const first = envAuthEmails(input.authUsers)[0];
  return first ?? null;
}

export function isSuperAdminEmail(
  email: string | null | undefined,
  input: { superAdminEmail?: string; authUsers?: string },
): boolean {
  const admin = resolveSuperAdminEmail(input);
  if (!admin || !email) return false;
  return normalizeEmail(email) === admin;
}
