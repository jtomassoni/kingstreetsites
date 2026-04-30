"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
          <label htmlFor="email" className="block text-sm text-slate-400 mb-1">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={sent}
            className="w-full rounded-lg bg-slate-800 border border-white/10 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark] disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={loading || sent}
          className="w-full rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-colors py-2.5 font-semibold text-white"
        >
          {loading ? "Sending…" : "Send sign-in link"}
        </button>
      </form>

      {sent && (
        <div className="mt-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-300 text-center">
          Check your email — a sign-in link is on its way.
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-400 mb-2 text-center">King Street Sites</p>
        <h1 className="text-2xl font-semibold text-white text-center mb-8">Sign in</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
