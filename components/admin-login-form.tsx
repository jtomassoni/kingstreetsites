"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      setLoading(false);
      setError("Invalid credentials.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-card">
      <label className="grid gap-1 text-sm">
        Username
        <input required name="username" className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
      </label>
      <label className="grid gap-1 text-sm">
        Password
        <input required type="password" name="password" className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
      </label>
      <button className="rounded-full bg-brand px-5 py-3 font-semibold text-white transition hover:bg-teal-600 disabled:opacity-60" disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </button>
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </form>
  );
}
