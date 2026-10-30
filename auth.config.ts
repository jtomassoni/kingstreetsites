import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no pg/Node.js imports
export default {
  providers: [],
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  callbacks: {
    /**
     * next-auth middleware authorization.
     * Only /admin requires the business CRM session.
     * /tools uses a separate signed cookie (see lib/tools/auth).
     */
    authorized({ request, auth }) {
      const path = request.nextUrl.pathname;
      if (path.startsWith("/admin")) {
        return !!auth;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
