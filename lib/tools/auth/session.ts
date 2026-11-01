import {
  isToolsAuthConfigured,
  signInEmails,
} from "@/lib/tools/auth/roles";
import {
  clearToolsSessionCookie,
  readToolsSessionUser,
  type ToolsSessionUser,
} from "@/lib/tools/auth/session-cookie";

export class ToolsAuthError extends Error {
  constructor(
    message: string,
    public code: "unauthenticated" | "unauthorized" | "misconfigured" =
      "unauthorized",
  ) {
    super(message);
    this.name = "ToolsAuthError";
  }
}

export type ToolsUser = ToolsSessionUser;

/**
 * Require a valid tools session whose email is still on the allowlist.
 * Does not grant /admin unless the user is a super admin (checked separately).
 */
export async function requireToolsUser(): Promise<ToolsUser> {
  if (!isToolsAuthConfigured()) {
    throw new ToolsAuthError(
      "Tools authentication is not configured.",
      "misconfigured",
    );
  }

  const user = await readToolsSessionUser();
  if (!user) {
    throw new ToolsAuthError("You must be signed in.", "unauthenticated");
  }

  const allowed = signInEmails();
  if (!allowed.includes(user.email)) {
    await clearToolsSessionCookie();
    throw new ToolsAuthError(
      "Your account is not authorized for household tools.",
      "unauthorized",
    );
  }

  return user;
}

export async function getToolsUser(): Promise<ToolsUser | null> {
  try {
    return await requireToolsUser();
  } catch (e) {
    if (e instanceof ToolsAuthError) return null;
    throw e;
  }
}
