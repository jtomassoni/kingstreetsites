"use client";

import { FormEvent, useState } from "react";

type FormState = "idle" | "loading" | "success" | "error";

const industries = ["Restaurant", "Law Firm", "Contractor", "Other"] as const;

export function ContactForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setState("error");
      setError(data?.error || "Something went wrong. Please try again.");
      return;
    }

    form.reset();
    setState("success");
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-card" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Name
          <input required name="name" className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
        </label>
        <label className="grid gap-1 text-sm">
          Business Name
          <input required name="businessName" className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Email
          <input required type="email" name="email" className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
        </label>
        <label className="grid gap-1 text-sm">
          Website
          <input name="website" placeholder="https://example.com" className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        Industry
        <select required name="industry" className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          {industries.map((industry) => (
            <option key={industry} value={industry}>
              {industry}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        What are you trying to improve?
        <textarea required name="message" rows={5} className="rounded-lg border border-white/20 bg-slate-950 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" />
      </label>
      <button
        disabled={state === "loading"}
        className="rounded-full bg-brand px-5 py-3 font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {state === "loading" ? "Sending..." : "Request Free Site Audit"}
      </button>
      {state === "success" && <p className="text-sm text-emerald-300">Thanks. Your request was submitted successfully.</p>}
      {state === "error" && <p className="text-sm text-rose-300">{error}</p>}
    </form>
  );
}
