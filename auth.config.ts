import type { NextAuthConfig } from "next-auth";

// Edge-compatible config — no pg/Node.js imports
export default {
  providers: [],
  pages: {
    signIn: "/login",
  },
  trustHost: true,
} satisfies NextAuthConfig;
