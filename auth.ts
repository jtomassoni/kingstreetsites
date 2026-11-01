import NextAuth from "next-auth";
import PostgresAdapter from "@auth/pg-adapter";
import Credentials from "next-auth/providers/credentials";
import FacebookProvider from "next-auth/providers/facebook";
import { timingSafeEqual } from "crypto";
import { getDbPool } from "@/lib/db";
import { crmSessionFromToolsCookie } from "@/lib/crm/session";
import authConfig from "./auth.config";

const hasMetaOAuth = Boolean(process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET);

function adminEmail(): string | null {
  const email = (process.env.ADMIN_EMAIL ?? process.env.CONTACT_TO_EMAIL ?? "").trim().toLowerCase();
  return email || null;
}

function adminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD ?? "";
  return password || null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const nextAuth = NextAuth({
  ...authConfig,
  ...(hasMetaOAuth ? { adapter: PostgresAdapter(getDbPool()) } : {}),
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const expectedEmail = adminEmail();
        const expectedPassword = adminPassword();
        if (!expectedEmail || !expectedPassword) {
          return null;
        }

        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        if (email !== expectedEmail) return null;
        if (!safeEqual(password, expectedPassword)) return null;

        return {
          id: "admin",
          name: "Admin",
          email: expectedEmail,
        };
      },
    }),
    ...(hasMetaOAuth
      ? [
          FacebookProvider({
            clientId: process.env.AUTH_FACEBOOK_ID as string,
            clientSecret: process.env.AUTH_FACEBOOK_SECRET as string,
            authorization: {
              params: {
                scope: "email public_profile",
              },
            },
          }),
          FacebookProvider({
            id: "instagram",
            name: "Instagram (Meta)",
            clientId: process.env.AUTH_FACEBOOK_ID as string,
            clientSecret: process.env.AUTH_FACEBOOK_SECRET as string,
            authorization: {
              params: {
                scope: "email public_profile instagram_basic pages_show_list",
              },
            },
          }),
        ]
      : []),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Prefer household-tools session for CRM-allowlisted users so one login
 * unlocks /tools and (for James) /admin. Falls back to next-auth.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = ((...args: any[]) => {
  if (args.length > 0) {
    return (nextAuth.auth as (...a: unknown[]) => unknown)(...args);
  }
  return (async () => {
    const fromTools = await crmSessionFromToolsCookie();
    if (fromTools) return fromTools;
    return nextAuth.auth();
  })();
}) as typeof nextAuth.auth;
