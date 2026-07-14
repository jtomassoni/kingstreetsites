"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  STANDARD_PAYMENT_METHODS,
  centsToDollars,
  formatMoney,
  type InvoiceStatus,
  type PaymentMethod,
} from "@/lib/billing";
import { crm, invoiceStatusTone } from "@/lib/admin-ui";
import FormActions, { isFormDirty } from "@/app/admin/components/form-actions";

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

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: PaymentMethod;
  paid_at: string;
  notes: string | null;
  created_at: string;
};

type EditInvoiceBaseline = {
  title: string;
  amount: string;
  dueDate: string;
  notes: string;
  status: string;
};

type PayEditBaseline = {
  amount: string;
  method: string;
  notes: string;
};

const CREATE_INVOICE_BASELINE = {
  title: "Website project",
  amount: "",
  dueDate: "",
  notes: "",
};


function formatInputDate(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatPaymentDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  const [feedback, setFeedback] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("Website project");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [createFeedback, setCreateFeedback] = useState("");

  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editInvoice, setEditInvoice] = useState<InvoiceRow | null>(null);
  const [editPayments, setEditPayments] = useState<PaymentRow[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<InvoiceStatus>("draft");
  const [editFeedback, setEditFeedback] = useState("");
  const [newPayAmount, setNewPayAmount] = useState("");
  const [newPayMethod, setNewPayMethod] = useState<PaymentMethod>("other");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [payEditAmount, setPayEditAmount] = useState("");
  const [payEditMethod, setPayEditMethod] = useState<PaymentMethod>("other");
  const [payEditNotes, setPayEditNotes] = useState("");
  const [editBaseline, setEditBaseline] = useState<EditInvoiceBaseline | null>(null);
  const [payEditBaseline, setPayEditBaseline] = useState<PayEditBaseline | null>(null);

  useEffect(() => {
    setInvoices(initialInvoices);
  }, [initialInvoices]);

  useEffect(() => {
    setBarterEnabled(initialBarterEnabled);
  }, [initialBarterEnabled]);

  const modalOpen = showCreateModal || Boolean(editInvoiceId);

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showCreateModal) closeCreateModal();
        else closeEditModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, showCreateModal]);

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

  async function loadInvoiceDetails(invoiceId: string) {
    const res = await fetch(`/api/invoices/${invoiceId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Could not load invoice.");
    return data as { invoice: InvoiceRow; payments: PaymentRow[]; paid_cents: number };
  }

  function populateEditForm(data: { invoice: InvoiceRow; payments: PaymentRow[] }) {
    const inv = data.invoice;
    const baseline = {
      title: inv.title,
      amount: centsToDollars(inv.amount_cents),
      dueDate: formatInputDate(inv.due_date),
      notes: inv.notes ?? "",
      status: inv.status,
    };
    setEditInvoice(inv);
    setEditPayments(data.payments);
    setEditTitle(baseline.title);
    setEditAmount(baseline.amount);
    setEditDueDate(baseline.dueDate);
    setEditNotes(baseline.notes);
    setEditStatus(inv.status);
    setEditBaseline(baseline);
    setNewPayAmount("");
    setNewPayMethod("other");
    setEditingPaymentId(null);
    setPayEditBaseline(null);
  }

  async function openEditInvoice(inv: InvoiceRow) {
    setEditFeedback("");
    setEditInvoiceId(inv.id);
    setEditLoading(true);
    try {
      const data = await loadInvoiceDetails(inv.id);
      populateEditForm(data);
    } catch (err) {
      setEditFeedback(err instanceof Error ? err.message : "Could not load invoice.");
      setEditInvoiceId(null);
    } finally {
      setEditLoading(false);
    }
  }

  async function reloadEditInvoice() {
    if (!editInvoiceId) return;
    const data = await loadInvoiceDetails(editInvoiceId);
    populateEditForm(data);
    await refresh();
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    setAmount(CREATE_INVOICE_BASELINE.amount);
    setNotes(CREATE_INVOICE_BASELINE.notes);
    setDueDate(CREATE_INVOICE_BASELINE.dueDate);
    setTitle(CREATE_INVOICE_BASELINE.title);
    setCreateFeedback("");
  }

  function cancelCreateForm() {
    setAmount(CREATE_INVOICE_BASELINE.amount);
    setNotes(CREATE_INVOICE_BASELINE.notes);
    setDueDate(CREATE_INVOICE_BASELINE.dueDate);
    setTitle(CREATE_INVOICE_BASELINE.title);
    setCreateFeedback("");
  }

  function cancelEditInvoiceForm() {
    if (!editBaseline) return;
    setEditTitle(editBaseline.title);
    setEditAmount(editBaseline.amount);
    setEditDueDate(editBaseline.dueDate);
    setEditNotes(editBaseline.notes);
    setEditStatus(editBaseline.status as InvoiceStatus);
    setEditFeedback("");
  }

  function closeEditModal() {
    setEditInvoiceId(null);
    setEditInvoice(null);
    setEditPayments([]);
    setEditBaseline(null);
    setEditFeedback("");
    setEditingPaymentId(null);
    setPayEditBaseline(null);
  }

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!createDirty) return;
    setCreateFeedback("");
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
      setCreateFeedback(data?.error ?? "Could not create invoice.");
      return;
    }
    closeCreateModal();
    setFeedback("Invoice created.");
    await refresh();
  }

  async function saveInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!editInvoiceId || !editInvoiceDirty) return;
    setEditFeedback("");
    const res = await fetch(`/api/invoices/${editInvoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        amount: Number(editAmount),
        due_date: editDueDate || null,
        notes: editNotes || null,
        status: editStatus,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditFeedback(data?.error ?? "Could not save invoice.");
      return;
    }
    setFeedback("Invoice updated.");
    await reloadEditInvoice();
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!editInvoiceId) return;
    const amt = Number(newPayAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditFeedback("Enter a payment amount.");
      return;
    }
    setEditFeedback("");
    const res = await fetch(`/api/invoices/${editInvoiceId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, method: newPayMethod }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditFeedback(data?.error ?? "Could not record payment.");
      return;
    }
    setNewPayAmount("");
    setFeedback("Payment recorded.");
    await reloadEditInvoice();
  }

  function startEditPayment(payment: PaymentRow) {
    setPayEditBaseline({
      amount: centsToDollars(payment.amount_cents),
      method: payment.method,
      notes: payment.notes ?? "",
    });
    setEditingPaymentId(payment.id);
    setPayEditAmount(centsToDollars(payment.amount_cents));
    setPayEditMethod(payment.method);
    setPayEditNotes(payment.notes ?? "");
    setEditFeedback("");
  }

  function cancelEditPayment() {
    if (payEditBaseline) {
      setPayEditAmount(payEditBaseline.amount);
      setPayEditMethod(payEditBaseline.method as PaymentMethod);
      setPayEditNotes(payEditBaseline.notes);
    }
    setEditingPaymentId(null);
    setPayEditBaseline(null);
    setEditFeedback("");
  }

  async function savePaymentEdit(paymentId: string) {
    if (!editInvoiceId || !payEditDirty) return;
    const amt = Number(payEditAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditFeedback("Enter a valid payment amount.");
      return;
    }
    setEditFeedback("");
    const res = await fetch(`/api/invoices/${editInvoiceId}/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amt,
        method: payEditMethod,
        notes: payEditNotes || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditFeedback(data?.error ?? "Could not update payment.");
      return;
    }
    cancelEditPayment();
    setFeedback("Payment updated.");
    await reloadEditInvoice();
  }

  async function deletePayment(paymentId: string) {
    if (!editInvoiceId) return;
    if (!window.confirm("Remove this payment?")) return;
    setEditFeedback("");
    const res = await fetch(`/api/invoices/${editInvoiceId}/payments/${paymentId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditFeedback(data?.error ?? "Could not delete payment.");
      return;
    }
    cancelEditPayment();
    setFeedback("Payment removed.");
    await reloadEditInvoice();
  }

  const outstanding = invoices
    .filter((i) => i.status !== "void" && i.status !== "paid")
    .reduce((sum, i) => sum + Math.max(0, i.amount_cents - (i.paid_cents ?? 0)), 0);
  const collected = invoices
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + (i.paid_cents ?? (i.status === "paid" ? i.amount_cents : 0)), 0);

  const editPaidCents = editPayments.reduce((sum, p) => sum + p.amount_cents, 0);
  const editRemaining = editInvoice
    ? Math.max(0, editInvoice.amount_cents - editPaidCents)
    : 0;

  const createDirty = isFormDirty(
    { title, amount, dueDate, notes },
    CREATE_INVOICE_BASELINE
  );

  const editInvoiceDirty = editBaseline
    ? isFormDirty(
        { title: editTitle, amount: editAmount, dueDate: editDueDate, notes: editNotes, status: editStatus },
        editBaseline
      )
    : false;

  const payEditDirty = payEditBaseline
    ? isFormDirty(
        { amount: payEditAmount, method: payEditMethod, notes: payEditNotes },
        payEditBaseline
      )
    : false;

  return (
    <>
      <div className={crm.panel}>
        <div className={`${crm.panelHeader} flex flex-wrap items-start justify-between gap-3`}>
          <div>
            <h2 className={crm.panelTitle}>Billing</h2>
            <p className={crm.panelHint}>
              Outstanding {formatMoney(outstanding)} · Collected {formatMoney(collected)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCreateFeedback("");
                setShowCreateModal(true);
              }}
              className={crm.btnPrimary}
            >
              Create invoice
            </button>
            <label className={`${crm.btn} cursor-pointer gap-2`}>
              <input
                type="checkbox"
                checked={barterEnabled}
                onChange={(e) => toggleBarter(e.target.checked)}
                disabled={isPending}
                className="rounded border-crm-border bg-crm-bg"
              />
              <span>Barter payments</span>
            </label>
          </div>
        </div>

        <div className={crm.panelBody}>
          {barterEnabled ? (
            <p className="mb-4 text-xs text-amber-400">
              Bar tab payments count as taxable revenue. Record them using the Bar tab method.
            </p>
          ) : null}

          {feedback && !modalOpen ? <p className="mb-3 text-xs text-crm-muted">{feedback}</p> : null}

          {invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-crm-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-crm-text">No invoices yet</p>
              <p className="mt-1 text-xs text-crm-faint">Create an invoice to track project fees and record payments.</p>
              <button type="button" onClick={() => setShowCreateModal(true)} className={`${crm.btnPrimary} mt-4`}>
                Create invoice
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-crm-border overflow-hidden rounded-lg border border-crm-border">
              {invoices.map((inv) => {
                const paid = inv.paid_cents ?? (inv.status === "paid" ? inv.amount_cents : 0);
                const remaining = Math.max(0, inv.amount_cents - paid);
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      onClick={() => openEditInvoice(inv)}
                      className={`${crm.listRow} w-full text-left hover:bg-crm-raised/50`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-crm-faint">{inv.invoice_number}</p>
                        <p className="text-sm font-medium text-crm-text">{inv.title}</p>
                        <p className="mt-0.5 text-xs text-crm-muted">
                          {formatMoney(inv.amount_cents, inv.currency)}
                          {paid > 0 ? ` · paid ${formatMoney(paid)}` : ""}
                          {remaining > 0 && inv.status !== "void" ? ` · due ${formatMoney(remaining)}` : ""}
                          {inv.due_date ? ` · due ${new Date(inv.due_date).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      <span className={crm.badge(invoiceStatusTone(inv.status))}>
                        {INVOICE_STATUS_LABEL[inv.status]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {showCreateModal ? (
        <div className={crm.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="create-invoice-title">
          <button type="button" className={crm.modalOverlay} onClick={closeCreateModal} aria-label="Close" />
          <div className={crm.modalPanel}>
            <div className={crm.modalHeader}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="create-invoice-title" className="text-lg font-semibold text-crm-text">
                    New invoice
                  </h3>
                  <p className="mt-1 text-sm text-crm-muted">
                    Add what you&apos;re billing for. Mark sent and record payments later.
                  </p>
                </div>
                <button type="button" onClick={closeCreateModal} className={crm.btnGhost} aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            <form id="create-invoice-form" onSubmit={createInvoice} className={`${crm.modalBody} space-y-4`}>
              <div className={crm.field}>
                <label className={crm.fieldLabel}>What is this for?</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Website rebuild, monthly retainer…"
                  required
                  className={crm.input}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={crm.field}>
                  <label className={crm.fieldLabel}>Amount</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-crm-faint">
                      $
                    </span>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      autoFocus
                      className={`${crm.input} pl-7 tabular-nums`}
                    />
                  </div>
                </div>
                <div className={crm.field}>
                  <label className={crm.fieldLabel}>Due date</label>
                  <input
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    type="date"
                    className={`${crm.input} [color-scheme:dark]`}
                  />
                </div>
              </div>
              <div className={crm.field}>
                <label className={crm.fieldLabel}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Scope, payment terms…"
                  rows={3}
                  className={`${crm.input} resize-none`}
                />
              </div>
              {createFeedback ? <p className="text-sm text-red-400">{createFeedback}</p> : null}
            </form>

            <div className={crm.modalFooter}>
              <FormActions
                dirty={createDirty}
                isPending={isPending}
                saveLabel="Create invoice"
                formId="create-invoice-form"
                onCancel={cancelCreateForm}
                feedback={createFeedback}
                className="pt-0"
              />
            </div>
          </div>
        </div>
      ) : null}

      {editInvoiceId ? (
        <div className={crm.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="edit-invoice-title">
          <button type="button" className={crm.modalOverlay} onClick={closeEditModal} aria-label="Close" />
          <div className={crm.modalPanelWide}>
            <div className={crm.modalHeader}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-crm-faint">{editInvoice?.invoice_number ?? "Loading…"}</p>
                  <h3 id="edit-invoice-title" className="text-lg font-semibold text-crm-text">
                    Edit invoice
                  </h3>
                  {editInvoice ? (
                    <p className="mt-1 text-sm text-crm-muted">
                      {formatMoney(editPaidCents)} collected
                      {editRemaining > 0 && editStatus !== "void"
                        ? ` · ${formatMoney(editRemaining)} remaining`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <button type="button" onClick={closeEditModal} className={crm.btnGhost} aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            <div className={crm.modalBody}>
              {editLoading ? (
                <p className="text-sm text-crm-faint">Loading invoice…</p>
              ) : (
                <div className="space-y-6">
                  <form id="edit-invoice-form" onSubmit={saveInvoice} className="space-y-4">
                    <label className="block space-y-2">
                      <span className={crm.fieldLabel}>Title</span>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        required
                        className={crm.input}
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="block space-y-2 sm:col-span-1">
                        <span className={crm.fieldLabel}>Amount</span>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                            $
                          </span>
                          <input
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            className={`${crm.input} pl-7 tabular-nums`}
                          />
                        </div>
                      </label>
                      <label className="block space-y-2 sm:col-span-1">
                        <span className={crm.fieldLabel}>Due date</span>
                        <input
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          type="date"
                          className={`${crm.input} [color-scheme:dark]`}
                        />
                      </label>
                      <label className="block space-y-2 sm:col-span-1">
                        <span className={crm.fieldLabel}>Status</span>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as InvoiceStatus)}
                          className={crm.input}
                        >
                          {INVOICE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {INVOICE_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block space-y-2">
                      <span className={crm.fieldLabel}>Notes</span>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        className={`${crm.input} resize-none leading-relaxed`}
                      />
                    </label>
                  </form>

                  <div className="border-t border-crm-border pt-5">
                    <h4 className={crm.fieldLabel}>Payments</h4>
                    {editPayments.length === 0 ? (
                      <p className="mt-2 text-sm text-crm-faint">No payments recorded yet.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {editPayments.map((payment) => (
                          <li
                            key={payment.id}
                            className={`${crm.card} p-3`}
                          >
                            {editingPaymentId === payment.id ? (
                              <div className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="block space-y-1.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                      Amount
                                    </span>
                                    <div className="relative">
                                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                                        $
                                      </span>
                                      <input
                                        value={payEditAmount}
                                        onChange={(e) => setPayEditAmount(e.target.value)}
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        className={`${crm.input} py-2 pl-6 text-xs`}
                                      />
                                    </div>
                                  </label>
                                  <label className="block space-y-1.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                      Method
                                    </span>
                                    <select
                                      value={payEditMethod}
                                      onChange={(e) =>
                                        setPayEditMethod(e.target.value as PaymentMethod)
                                      }
                                      className={`${crm.input} py-2 text-xs`}
                                    >
                                      {paymentMethods.map((m) => (
                                        <option key={m} value={m}>
                                          {PAYMENT_METHOD_LABEL[m]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <label className="block space-y-1.5">
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                    Notes
                                  </span>
                                  <input
                                    value={payEditNotes}
                                    onChange={(e) => setPayEditNotes(e.target.value)}
                                    className={`${crm.input} py-2 text-xs`}
                                  />
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  <FormActions
                                    dirty={payEditDirty}
                                    saveLabel="Save payment"
                                    onSave={() => savePaymentEdit(payment.id)}
                                    onCancel={cancelEditPayment}
                                    feedback={editingPaymentId === payment.id ? editFeedback : undefined}
                                    className="pt-0"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => deletePayment(payment.id)}
                                    className={`${crm.btnGhost} text-red-400`}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-crm-text">
                                    {formatMoney(payment.amount_cents)}
                                    <span className="ml-2 text-xs font-normal text-crm-faint">
                                      {PAYMENT_METHOD_LABEL[payment.method]}
                                    </span>
                                  </p>
                                  <p className="mt-0.5 text-xs text-crm-faint">
                                    {formatPaymentDate(payment.paid_at)}
                                  </p>
                                  {payment.notes ? (
                                    <p className="mt-1 text-xs text-crm-muted">{payment.notes}</p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => startEditPayment(payment)}
                                  className={crm.btn}
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {editStatus !== "void" ? (
                      <form onSubmit={addPayment} className={`${crm.card} mt-4 border-dashed p-3`}>
                        <p className={`${crm.fieldLabel} mb-2`}>Record payment</p>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="relative w-28">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                              $
                            </span>
                            <input
                              value={newPayAmount}
                              onChange={(e) => setNewPayAmount(e.target.value)}
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="0.00"
                              className={`${crm.input} py-2 pl-6 text-xs`}
                            />
                          </div>
                          <select
                            value={newPayMethod}
                            onChange={(e) => setNewPayMethod(e.target.value as PaymentMethod)}
                            className={`${crm.input} w-auto py-2 text-xs`}
                          >
                            {paymentMethods.map((m) => (
                              <option key={m} value={m}>
                                {PAYMENT_METHOD_LABEL[m]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className={crm.btnPrimary}
                          >
                            Add payment
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>

                  {editFeedback ? (
                    <p className="text-sm text-red-400">{editFeedback}</p>
                  ) : null}
                </div>
              )}
            </div>

            <div className={`${crm.modalFooter} sm:justify-between`}>
              <button type="button" onClick={closeEditModal} className={crm.btn}>
                Close
              </button>
              <FormActions
                dirty={editInvoiceDirty}
                isPending={isPending || editLoading}
                saveLabel="Save invoice"
                formId="edit-invoice-form"
                onCancel={cancelEditInvoiceForm}
                feedback={editFeedback}
                className="pt-0"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
