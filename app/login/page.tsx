"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { devSignIn } from "./actions";

function LoginForm() {
  const params = useSearchParams();
  const verify = params.get("verify");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(!!verify);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("resend", { email, redirect: false, redirectTo: "/app/dashboard" });
    setSent(true);
    setLoading(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-muted mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={sent}
            className="w-full rounded-xl border border-ink/10 bg-cream px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/30 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={loading || sent}
          className="w-full rounded-full bg-ink hover:bg-ink/90 disabled:opacity-50 transition-colors py-3 font-semibold text-cream"
        >
          {loading ? "Sending…" : "Send sign-in link"}
        </button>
      </form>

      {sent && (
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-brand-dark text-center">
          Check your email — a sign-in link is on its way.
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <main className="min-h-screen bg-cream flex flex-col">
      <header className="section py-6">
        <Link href="/" className="inline-flex items-center gap-2.5 text-ink">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink font-serif text-lg text-brand-light">
            K
          </span>
          <span className="font-semibold tracking-tight">King Street Sites</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="font-serif text-3xl text-ink text-center tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-ink-muted text-center">Team dashboard access</p>

          <div className="mt-8 rounded-2xl border border-ink/[0.06] bg-white p-6 shadow-card">
            {isDev && (
              <form action={devSignIn}>
                <button
                  type="submit"
                  className="w-full rounded-full border border-ink/10 bg-cream-dark hover:bg-cream transition-colors py-2.5 font-medium text-ink-muted mb-4 text-sm"
                >
                  Dev: sign in instantly
                </button>
              </form>
            )}

            <Suspense>
              <LoginForm />
            </Suspense>
          </div>

          <p className="mt-6 text-center text-sm text-ink-faint">
            <Link href="/" className="hover:text-ink transition-colors">
              ← Back to site
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
