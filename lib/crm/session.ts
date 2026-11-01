import type { Session } from "next-auth";
import { isSuperAdmin, signInEmails } from "@/lib/tools/auth/roles";
import { readToolsSessionUser } from "@/lib/tools/auth/session-cookie";

/** Session-shaped object so existing `auth()` callers keep working. */
export async function crmSessionFromToolsCookie(): Promise<Session | null> {
  const user = await readToolsSessionUser();
  if (!user) return null;

  if (!signInEmails().includes(user.email)) return null;
  if (!isSuperAdmin(user.email)) return null;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.email.split("@")[0] || user.email,
    },
    expires: new Date(Date.now() + 60 * 60 * 24 * 30 * 1000).toISOString(),
  };
}
