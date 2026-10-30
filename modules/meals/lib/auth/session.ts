import { cache } from "react";
import { queryOne } from "@meals/lib/db";
import { envAuthEmails } from "@meals/lib/auth/env-users";
import { readSessionUser, type SessionUser } from "@meals/lib/auth/session-cookie";

export class AuthError extends Error {
  constructor(
    message: string,
    public code:
      | "unauthenticated"
      | "unauthorized"
      | "no_household" = "unauthorized",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AppUser = SessionUser;

export async function requireUser(): Promise<AppUser> {
  const user = await readSessionUser();
  if (!user) {
    throw new AuthError("You must be signed in.", "unauthenticated");
  }

  const allowed = envAuthEmails();
  if (!allowed.length || !allowed.includes(user.email)) {
    throw new AuthError(
      "Your account is not authorized for this app.",
      "unauthorized",
    );
  }

  return user;
}

export const requireHouseholdContext = cache(async () => {
  const user = await requireUser();

  const membership = await queryOne<{
    household_id: string;
  }>`
    SELECT household_id
    FROM household_members
    WHERE user_id = ${user.id} AND is_active = true
    LIMIT 1
  `;

  if (!membership) {
    throw new AuthError(
      "No household membership found. Sign in again to provision your household.",
      "no_household",
    );
  }

  return {
    user,
    householdId: membership.household_id,
  };
});

export async function getCurrentProfile() {
  const { user, householdId } = await requireHouseholdContext();
  const profile = await queryOne<import("@meals/types/database").Profile>`
    SELECT * FROM profiles WHERE id = ${user.id} LIMIT 1
  `;
  return { user, householdId, profile };
}
