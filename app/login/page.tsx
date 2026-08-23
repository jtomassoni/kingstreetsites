"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        redirectTo: "/admin/leads",
      });
      if (result?.error) {
        setError(
          result.error === "Configuration"
            ? "Admin login is not configured (set ADMIN_EMAIL and ADMIN_PASSWORD)."
            : "Invalid email or password."
        );
        return;
      }
      if (result?.ok) {
        router.push("/admin/leads");
        router.refresh();
        return;
      }
      setError("Could not sign in. Try again.");
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink-muted mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="w-full rounded-xl border border-ink/10 bg-cream px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/30 disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink-muted mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-ink/10 bg-cream px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/30 disabled:opacity-50"
                />
              </div>
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-ink hover:bg-ink/90 disabled:opacity-50 transition-colors py-3 font-semibold text-cream"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
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
