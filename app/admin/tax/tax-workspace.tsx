"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  centsToDollars,
  formatDateOnly,
  formatMoney,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from "@/lib/billing";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  type BusinessExpense,
  type ExpenseCategory,
  type TaxIncomeRow,
  type TaxYearSummary,
} from "@/lib/tax";
import { crm } from "@/lib/admin-ui";

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type Props = {
  year: number;
  years: number[];
  summary: TaxYearSummary;
};

export default function TaxWorkspace({ year, years, summary }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [incurredOn, setIncurredOn] = useState(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>("hosting_software");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<BusinessExpense> | null>(null);

  const cashIncome = useMemo(
    () => summary.income_rows.filter((r) => r.method !== "barter"),
    [summary.income_rows]
  );
  const barterIncome = useMemo(
    () => summary.income_rows.filter((r) => r.method === "barter"),
    [summary.income_rows]
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/tax/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incurred_on: incurredOn,
          category,
          description,
          vendor: vendor || null,
          amount: Number(amount),
          recurring,
          notes: notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(typeof data.error === "string" ? data.error : "Could not save expense.");
        return;
      }
      setDescription("");
      setVendor("");
      setAmount("");
      setNotes("");
      setRecurring(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/tax/expenses/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incurred_on: editDraft.incurred_on?.slice(0, 10),
          category: editDraft.category,
          description: editDraft.description,
          vendor: editDraft.vendor,
          amount_cents: editDraft.amount_cents,
          recurring: editDraft.recurring,
          notes: editDraft.notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(typeof data.error === "string" ? data.error : "Could not update expense.");
        return;
      }
      setEditingId(null);
      setEditDraft(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/tax/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback(typeof data.error === "string" ? data.error : "Could not delete expense.");
        return;
      }
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <a key={y} href={`/admin/tax?year=${y}`} className={crm.pill(y === year)}>
              {y}
            </a>
          ))}
        </div>
        <a
          href={`/api/tax/export?year=${year}&format=csv`}
          className={crm.btnPrimary}
          download
        >
          Export {year} CSV
        </a>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">
        <p className="font-medium text-amber-100">Solo proprietorship — Schedule C</p>
        <p className="mt-1 text-amber-100/80">
          Barter is taxable income at fair market value (what the client would have paid in cash). It is
          included in gross receipts below, broken out so you can see cash vs barter. This export is a
          bookkeeping aid — not tax advice; confirm with your preparer or IRS Pub 525 / Schedule C
          instructions.
        </p>
      </div>

      <div className={`${crm.statGrid} sm:grid-cols-2 lg:grid-cols-4`}>
        <div className={crm.statTile}>
          <p className={crm.statLabel}>Cash / card / check</p>
          <p className={crm.statValue}>{formatMoney(summary.income_cash_cents)}</p>
        </div>
        <div className={crm.statTile}>
          <p className={crm.statLabel}>Barter (FMV)</p>
          <p className={crm.statValue}>{formatMoney(summary.income_barter_cents)}</p>
        </div>
        <div className={crm.statTile}>
          <p className={crm.statLabel}>Gross receipts</p>
          <p className={crm.statValue}>{formatMoney(summary.income_total_cents)}</p>
        </div>
        <div className={crm.statTile}>
          <p className={crm.statLabel}>Expenses</p>
          <p className={crm.statValue}>{formatMoney(summary.expenses_cents)}</p>
        </div>
      </div>

      <div className={crm.card}>
        <div className={crm.metaRow}>
          <span className={crm.metaLabel}>Approx. net (receipts − expenses)</span>
          <span className={`${crm.metaValue} font-semibold tabular-nums`}>
            {formatMoney(summary.net_cents)}
          </span>
        </div>
        {summary.expenses_by_category.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-crm-border/60 pt-4">
            <p className={crm.sectionTitle}>Expenses by category</p>
            {summary.expenses_by_category.map((row) => (
              <div key={row.category} className={crm.metaRow}>
                <span className={crm.metaLabel}>{EXPENSE_CATEGORY_LABEL[row.category]}</span>
                <span className={crm.metaValue}>{formatMoney(row.amount_cents)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {feedback ? (
        <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {feedback}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className={crm.sectionTitle}>Business expenses</h2>
          <p className="text-sm text-crm-muted">
            Laptop, hosting, domains, tools, etc. Mark recurring items (e.g. monthly Vercel) so they are
            easy to spot at year-end.
          </p>
        </div>

        <form onSubmit={addExpense} className={`${crm.card} space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className={crm.field}>
              <label className={crm.fieldLabel} htmlFor="exp-date">
                Date
              </label>
              <input
                id="exp-date"
                type="date"
                required
                value={incurredOn}
                onChange={(e) => setIncurredOn(e.target.value)}
                className={crm.input}
              />
            </div>
            <div className={crm.field}>
              <label className={crm.fieldLabel} htmlFor="exp-category">
                Category
              </label>
              <select
                id="exp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className={crm.input}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className={crm.field}>
              <label className={crm.fieldLabel} htmlFor="exp-amount">
                Amount
              </label>
              <input
                id="exp-amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={crm.input}
              />
            </div>
            <div className={`${crm.field} sm:col-span-2`}>
              <label className={crm.fieldLabel} htmlFor="exp-desc">
                Description
              </label>
              <input
                id="exp-desc"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="MacBook Pro, Neon Pro, domain renewal…"
                className={crm.input}
              />
            </div>
            <div className={crm.field}>
              <label className={crm.fieldLabel} htmlFor="exp-vendor">
                Vendor
              </label>
              <input
                id="exp-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Apple, Vercel, Google…"
                className={crm.input}
              />
            </div>
            <div className={`${crm.field} sm:col-span-2`}>
              <label className={crm.fieldLabel} htmlFor="exp-notes">
                Notes
              </label>
              <input
                id="exp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className={crm.input}
              />
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm text-crm-muted">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="rounded border-crm-border"
              />
              Recurring charge
            </label>
          </div>
          <div className={crm.formActions}>
            <button type="submit" disabled={busy} className={crm.btnPrimary}>
              {busy ? "Saving…" : "Add expense"}
            </button>
          </div>
        </form>

        {summary.expense_rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-crm-border p-8 text-center text-sm text-crm-muted">
            No expenses logged for {year} yet.
          </div>
        ) : (
          <ul className={crm.list}>
            {summary.expense_rows.map((exp) => {
              const editing = editingId === exp.id;
              return (
                <li key={exp.id} className={`${crm.listRow} items-start`}>
                  {editing && editDraft ? (
                    <div className="w-full space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <input
                          type="date"
                          value={editDraft.incurred_on?.slice(0, 10) ?? ""}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, incurred_on: e.target.value })
                          }
                          className={crm.input}
                        />
                        <select
                          value={editDraft.category}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              category: e.target.value as ExpenseCategory,
                            })
                          }
                          className={crm.input}
                        >
                          {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {EXPENSE_CATEGORY_LABEL[c]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={centsToDollars(editDraft.amount_cents ?? 0)}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              amount_cents: Math.round(Number(e.target.value) * 100),
                            })
                          }
                          className={crm.input}
                        />
                      </div>
                      <input
                        value={editDraft.description ?? ""}
                        onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                        className={crm.input}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={saveEdit} disabled={busy} className={crm.btnPrimary}>
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          className={crm.btn}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-crm-text">{exp.description}</p>
                        <p className="mt-0.5 text-sm text-crm-muted">
                          {formatDateOnly(exp.incurred_on)} ·{" "}
                          {EXPENSE_CATEGORY_LABEL[exp.category] ?? exp.category}
                          {exp.vendor ? ` · ${exp.vendor}` : ""}
                          {exp.recurring ? " · recurring" : ""}
                        </p>
                        {exp.notes ? <p className="mt-1 text-xs text-crm-faint">{exp.notes}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-sm font-medium text-crm-text">
                          {formatMoney(exp.amount_cents)}
                        </span>
                        <button
                          type="button"
                          className={crm.btnGhost}
                          onClick={() => {
                            setEditingId(exp.id);
                            setEditDraft({ ...exp });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={crm.btnGhost}
                          onClick={() => deleteExpense(exp.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <IncomeSection title={`Cash income (${year})`} rows={cashIncome} empty="No cash / card / check payments this year." />
      <IncomeSection
        title={`Barter income — FMV (${year})`}
        rows={barterIncome}
        empty="No barter payments this year."
        barterHint
      />
    </div>
  );
}

function IncomeSection({
  title,
  rows,
  empty,
  barterHint,
}: {
  title: string;
  rows: TaxIncomeRow[];
  empty: string;
  barterHint?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className={crm.sectionTitle}>{title}</h2>
        {barterHint ? (
          <p className="text-sm text-crm-muted">
            Report these amounts as gross receipts even though no cash changed hands.
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-crm-border p-8 text-center text-sm text-crm-muted">
          {empty}
        </div>
      ) : (
        <ul className={crm.list}>
          {rows.map((row) => (
            <li key={row.payment_id} className={crm.listRow}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-crm-text">{row.business_name}</p>
                <p className="mt-0.5 text-sm text-crm-muted">
                  {formatDateOnly(row.paid_at)} · {row.invoice_number} · {row.invoice_title}
                </p>
                {row.notes ? <p className="mt-1 text-xs text-crm-faint">{row.notes}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="tabular-nums text-sm font-medium text-crm-text">
                  {formatMoney(row.amount_cents)}
                </span>
                <span className={crm.badge(row.method === "barter" ? "warn" : "neutral")}>
                  {PAYMENT_METHOD_LABEL[row.method as PaymentMethod] ?? row.method}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
