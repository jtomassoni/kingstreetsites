"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AddLeadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    business_name: "",
    contact_email: "",
    phone: "",
    website_url: "",
    address: "",
    metro: "",
    zip: "",
    cuisine: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Could not create lead.");
      return;
    }
    setOpen(false);
    setForm({
      business_name: "",
      contact_email: "",
      phone: "",
      website_url: "",
      address: "",
      metro: "",
      zip: "",
      cuisine: "",
    });
    startTransition(() => {
      router.push(`/admin/leads/${data.lead.id}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500"
      >
        Add lead
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-teal-500/25 bg-slate-950/80 p-4 shadow-lg shadow-black/30 ring-1 ring-white/[0.04] sm:min-w-[22rem]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Add lead manually</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={submit} className="grid gap-2.5 sm:grid-cols-2">
        <label className="sm:col-span-2 block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Business name *
          </span>
          <input
            required
            value={form.business_name}
            onChange={(e) => update("business_name", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            placeholder="Harbor Grill"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Email</span>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => update("contact_email", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            placeholder="owner@example.com"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Phone</span>
          <input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            placeholder="(555) 123-4567"
          />
        </label>
        <label className="sm:col-span-2 block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Website</span>
          <input
            value={form.website_url}
            onChange={(e) => update("website_url", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            placeholder="https://"
          />
        </label>
        <label className="sm:col-span-2 block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Address</span>
          <input
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Metro</span>
          <input
            value={form.metro}
            onChange={(e) => update("metro", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            placeholder="Alexandria"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">ZIP</span>
          <input
            value={form.zip}
            onChange={(e) => update("zip", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            placeholder="22314"
          />
        </label>
        <label className="sm:col-span-2 block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Cuisine / type</span>
          <input
            value={form.cuisine}
            onChange={(e) => update("cuisine", e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
            placeholder="Italian, cafe, bar…"
          />
        </label>
        {error ? <p className="sm:col-span-2 text-sm text-red-300">{error}</p> : null}
        <div className="sm:col-span-2 flex justify-end pt-1">
          <button
            type="submit"
            disabled={isPending || !form.business_name.trim()}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Create lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
