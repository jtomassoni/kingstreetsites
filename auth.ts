import NextAuth from "next-auth";
import PostgresAdapter from "@auth/pg-adapter";
import ResendProvider from "next-auth/providers/resend";
import { Pool } from "pg";
import authConfig from "./auth.config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAdapter(pool),
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    ResendProvider({
      from: process.env.AUTH_FROM_EMAIL ?? "onboarding@resend.dev",
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        const { Resend } = await import("resend");
        const client = new Resend(process.env.RESEND_API_KEY);
        await client.emails.send({
          from: provider.from as string,
          to: identifier,
          subject: "Sign in to King Street Sites",
          html: `
            <p>Click the link below to sign in. This link expires in 24 hours.</p>
            <p><a href="${url}" style="background:#0d9488;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Sign in to King Street Sites</a></p>
            <p style="color:#94a3b8;font-size:12px">Or copy this URL: ${url}</p>
          `,
        });
      },
    }),
  ],
});
