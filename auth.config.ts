import type { NextAuthConfig } from "next-auth";
import { isSuperAdmin, signInEmails } from "@/lib/tools/auth/roles";
import {
  TOOLS_SESSION_COOKIE,
  verifyToolsSessionToken,
} from "@/lib/tools/auth/session-cookie";

function isCrmPath(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

async function superAdminFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${TOOLS_SESSION_COOKIE}=([^;]+)`),
  );
  const token = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  const user = await verifyToolsSessionToken(token);
  if (!user) return null;
  if (!signInEmails().includes(user.email)) return null;
  if (!isSuperAdmin(user.email)) return null;
  return user;
}

// Edge-compatible config — no pg/Node.js imports
export default {
  providers: [],
  pages: {
    signIn: "/tools/login",
  },
  trustHost: true,
  callbacks: {
    /**
     * /admin requires next-auth OR a tools session for a super admin.
     * App users (e.g. Mary) are denied here; middleware sends them to /tools.
     */
    async authorized({ request, auth }) {
      const path = request.nextUrl.pathname;
      if (!isCrmPath(path)) return true;
      if (auth) return true;
      return Boolean(await superAdminFromRequest(request));
    },
  },
} satisfies NextAuthConfig;
