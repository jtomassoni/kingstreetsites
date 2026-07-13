"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  STANDARD_PAYMENT_METHODS,
  formatMoney,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/lib/billing";

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  title: string;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  notes: string | null;
  paid_cents?: number;
  paid_at: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: "bg-slate-700/80 text-slate-200 ring-slate-500/30",
  sent: "bg-sky-500/15 text-sky-200 ring-sky-500/30",
  paid: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30",
  void: "bg-slate-800 text-slate-500 ring-white/10",
  overdue: "bg-red-500/15 text-red-200 ring-red-500/30",
};

export default function BillingPanel({
  leadId,
  initialInvoices,
  initialBarterEnabled = false,
}: {
  leadId: string;
  initialInvoices: InvoiceRow[];
  initialBarterEnabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [barterEnabled, setBarterEnabled] = useState(initialBarterEnabled);
  const [title, setTitle] = useState("Website project");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [payMethod, setPayMethod] = useState<Record<string, PaymentMethod>>({});

  useEffect(() => {
    setInvoices(initialInvoices);
  }, [initialInvoices]);

  useEffect(() => {
    setBarterEnabled(initialBarterEnabled);
  }, [initialBarterEnabled]);

  const paymentMethods: PaymentMethod[] = barterEnabled
    ? [...STANDARD_PAYMENT_METHODS, "barter"]
    : [...STANDARD_PAYMENT_METHODS];

  async function toggleBarter(next: boolean) {
    setFeedback("");
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barter_payments_enabled: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data?.error ?? "Could not update barter setting.");
      return;
    }
    setBarterEnabled(next);
    if (!next) {
      setPayMethod((prev) => {
        const nextMethods = { ...prev };
        for (const [invoiceId, method] of Object.entries(nextMethods)) {
          if (method === "barter") nextMethods[invoiceId] = "other";
        }
        return nextMethods;
      });
    }
    startTransition(() => router.refresh());
  }

  async function refresh() {
    const res = await fetch(`/api/leads/${leadId}/invoices`);
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices ?? []);
    }
    startTransition(() => router.refresh());
  }

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    setFeedback("");
    const res = await fetch(`/api/leads/${leadId}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        amount: Number(amount),
        due_date: dueDate || null,
        notes: notes || null,
        status: "draft",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data?.error ?? "Could not create invoice.");
      return;
    }
    setAmount("");
    setNotes("");
    setDueDate("");
    setFeedback("Invoice created.");
    await refresh();
  }

  async function setStatus(invoiceId: string, status: InvoiceStatus) {
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFeedback(data?.error ?? "Could not update invoice.");
      return;
    }
    await refresh();
  }

  async function recordPayment(invoiceId: string) {
    const amt = Number(payAmount[invoiceId] ?? "");
    if (!Number.isFinite(amt) || amt <= 0) {
      setFeedback("Enter a payment amount.");
      return;
    }
    const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amt,
        method: payMethod[invoiceId] ?? "other",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data?.error ?? "Could not record payment.");
      return;
    }
    setPayAmount((prev) => ({ ...prev, [invoiceId]: "" }));
    setFeedback("Payment recorded.");
    await refresh();
  }

  const outstanding = invoices
    .filter((i) => i.status !== "void" && i.status !== "paid")
    .reduce((sum, i) => sum + Math.max(0, i.amount_cents - (i.paid_cents ?? 0)), 0);
  const collected = invoices
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + (i.paid_cents ?? (i.status === "paid" ? i.amount_cents : 0)), 0);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Billing</h2>
          <p className="mt-1 text-sm text-slate-400">
            Outstanding{" "}
            <span className="font-semibold text-amber-200">{formatMoney(outstanding)}</span>
            {" · "}
            Collected <span className="font-semibold text-emerald-300">{formatMoney(collected)}</span>
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={barterEnabled}
            onChange={(e) => toggleBarter(e.target.checked)}
            disabled={isPending}
            className="rounded border-white/20 bg-slate-900 text-amber-500 focus:ring-amber-500/40"
          />
          <span className="text-slate-300">Barter payments (bar tabs)</span>
        </label>
      </div>

      {barterEnabled ? (
        <p className="mb-4 text-xs text-amber-200/80">
          Bar tab payments count as taxable revenue. Record them against an invoice using the &ldquo;Bar tab&rdquo; method.
        </p>
      ) : null}

      <form onSubmit={createInvoice} className="mb-5 grid gap-2 rounded-lg border border-dashed border-white/15 bg-slate-950/50 p-3 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Invoice title"
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40 sm:col-span-2"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (USD)"
          type="number"
          min="0"
          step="0.01"
          required
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
        />
        <input
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          type="date"
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500/40 sm:col-span-2"
        />
        <div className="flex justify-end sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
          >
            Create invoice
          </button>
        </div>
      </form>

      {feedback ? <p className="mb-3 text-xs text-slate-400">{feedback}</p> : null}

      {invoices.length === 0 ? (
        <p className="text-sm text-slate-500">No invoices yet.</p>
      ) : (
        <ul className="space-y-3">
          {invoices.map((inv) => {
            const paid = inv.paid_cents ?? (inv.status === "paid" ? inv.amount_cents : 0);
            const remaining = Math.max(0, inv.amount_cents - paid);
            return (
              <li key={inv.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-teal-400/90">{inv.invoice_number}</p>
                    <p className="text-sm font-medium text-white">{inv.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatMoney(inv.amount_cents, inv.currency)}
                      {paid > 0 ? ` · paid ${formatMoney(paid)}` : ""}
                      {remaining > 0 && inv.status !== "void" ? ` · due ${formatMoney(remaining)}` : ""}
                      {inv.due_date ? ` · due ${new Date(inv.due_date).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[inv.status]}`}
                  >
                    {INVOICE_STATUS_LABEL[inv.status]}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={inv.status}
                    onChange={(e) => setStatus(inv.id, e.target.value as InvoiceStatus)}
                    className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                  >
                    {INVOICE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {INVOICE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>

                  {inv.status !== "void" && inv.status !== "paid" ? (
                    <>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Payment $"
                        value={payAmount[inv.id] ?? ""}
                        onChange={(e) =>
                          setPayAmount((prev) => ({ ...prev, [inv.id]: e.target.value }))
                        }
                        className="w-24 rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                      />
                      <select
                        value={payMethod[inv.id] ?? "other"}
                        onChange={(e) =>
                          setPayMethod((prev) => ({
                            ...prev,
                            [inv.id]: e.target.value as PaymentMethod,
                          }))
                        }
                        className="rounded-md border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                      >
                        {paymentMethods.map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABEL[m]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => recordPayment(inv.id)}
                        className="rounded-md bg-emerald-600/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Record payment
                      </button>
                    </>
                  ) : null}
                </div>
                {inv.notes ? <p className="mt-2 text-xs text-slate-500">{inv.notes}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
