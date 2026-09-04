"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  RECURRING_FREQUENCIES,
  RECURRING_FREQUENCY_LABEL,
  centsToDollars,
  formatMoney,
  formatDateOnly,
  toDateOnlyString,
  type InvoiceStatus,
  type PaymentMethod,
  type RecurringFrequency,
} from "@/lib/billing";
import { crm, invoiceStatusTone } from "@/lib/admin-ui";
import FormActions, { isFormDirty } from "@/app/admin/components/form-actions";
import {
  RECEIPT_MAX_COUNT,
  type PaymentReceipt,
} from "@/lib/payment-receipts";
import {
  invoiceActivityDetail,
  invoiceActivityLabel,
  type InvoiceActivityEvent,
} from "@/lib/invoice-activity";
import {
  templateToCreateFields,
  type InvoiceTemplate,
} from "@/lib/invoice-templates";

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
  schedule_id?: string | null;
  schedule_frequency?: RecurringFrequency | null;
  schedule_active?: boolean | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: PaymentMethod;
  paid_at: string;
  notes: string | null;
  receipts?: PaymentReceipt[];
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
  recurring: false,
  frequency: "monthly" as RecurringFrequency,
  endOn: "",
};


function formatInputDate(value: string | Date | null) {
  return toDateOnlyString(value) ?? "";
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

function isImageReceipt(receipt: PaymentReceipt) {
  return receipt.content_type.startsWith("image/");
}

function ReceiptLinks({ receipts }: { receipts: PaymentReceipt[] }) {
  if (!receipts.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {receipts.map((receipt) =>
        isImageReceipt(receipt) ? (
          <a
            key={receipt.url}
            href={receipt.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-md border border-crm-border/70 bg-crm-bg/50"
            title={receipt.filename}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receipt.url}
              alt={receipt.filename}
              className="size-14 object-cover"
            />
          </a>
        ) : (
          <a
            key={receipt.url}
            href={receipt.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${crm.btn} py-1 text-xs`}
            title={receipt.filename}
          >
            PDF receipt
          </a>
        )
      )}
    </div>
  );
}

function ReceiptFilePicker({
  files,
  onChange,
  id,
  label = "Receipt photos",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  id: string;
  label?: string;
}) {
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
    };
  }, [previews]);

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        multiple
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const merged = [...files, ...picked].slice(0, RECEIPT_MAX_COUNT);
          onChange(merged);
          e.target.value = "";
        }}
        className="block w-full text-xs text-crm-muted file:mr-3 file:rounded-md file:border-0 file:bg-crm-raised file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-crm-text"
      />
      <p className="text-[11px] text-crm-faint">
        JPG, PNG, WebP, HEIC, or PDF · up to {RECEIPT_MAX_COUNT} files · 10 MB each
      </p>
      {previews.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {previews.map((preview, index) => (
            <div
              key={`${preview.file.name}-${index}`}
              className="relative overflow-hidden rounded-md border border-crm-border/70 bg-crm-bg/50"
            >
              {preview.file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt={preview.file.name} className="size-14 object-cover" />
              ) : (
                <div className="flex size-14 items-center justify-center px-1 text-[10px] text-crm-muted">
                  PDF
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute right-0 top-0 bg-crm-bg/90 px-1 text-[10px] text-crm-muted hover:text-crm-text"
                aria-label={`Remove ${preview.file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function activityBadgeTone(eventType: string): "good" | "neutral" | "warn" {
  if (eventType === "payment_deleted") return "warn";
  if (eventType === "invoice_sent" || eventType === "payment_receipt_sent") return "good";
  if (eventType.startsWith("payment")) return "good";
  return "neutral";
}

function InvoiceActivityLog({ activity }: { activity: InvoiceActivityEvent[] }) {
  if (activity.length === 0) {
    return <p className="mt-2 text-sm text-crm-faint">No activity yet.</p>;
  }

  return (
    <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
      {activity.map((event) => (
          <li key={event.id} className={`${crm.card} px-3 py-2.5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={crm.badge(activityBadgeTone(event.event_type))}>
                    {invoiceActivityLabel(event.event_type)}
                  </span>
                  <span className="text-xs text-crm-muted">{invoiceActivityDetail(event)}</span>
                </div>
              </div>
              <time
                className="shrink-0 text-[11px] tabular-nums text-crm-faint"
                title={formatPaymentDate(event.created_at)}
              >
                {formatPaymentDate(event.created_at)}
              </time>
            </div>
          </li>
        ))}
    </ul>
  );
}

export default function BillingPanel({
  leadId,
  contactEmail,
  initialInvoices,
}: {
  leadId: string;
  contactEmail?: string | null;
  initialInvoices: InvoiceRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [feedback, setFeedback] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("Website project");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [endOn, setEndOn] = useState("");
  const [sendOnCreate, setSendOnCreate] = useState(() => Boolean(contactEmail?.trim()));
  const [createFeedback, setCreateFeedback] = useState("");
  const [invoiceTemplates, setInvoiceTemplates] = useState<InvoiceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editInvoice, setEditInvoice] = useState<InvoiceRow | null>(null);
  const [editPayments, setEditPayments] = useState<PaymentRow[]>([]);
  const [editActivity, setEditActivity] = useState<InvoiceActivityEvent[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<InvoiceStatus>("draft");
  const [editFeedback, setEditFeedback] = useState("");
  const [newPayAmount, setNewPayAmount] = useState("");
  const [newPayMethod, setNewPayMethod] = useState<PaymentMethod>("card");
  const [newPayNotes, setNewPayNotes] = useState("");
  const [newPayReceipts, setNewPayReceipts] = useState<File[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [payEditAmount, setPayEditAmount] = useState("");
  const [payEditMethod, setPayEditMethod] = useState<PaymentMethod>("card");
  const [payEditNotes, setPayEditNotes] = useState("");
  const [payEditReceipts, setPayEditReceipts] = useState<File[]>([]);
  const [editBaseline, setEditBaseline] = useState<EditInvoiceBaseline | null>(null);
  const [payEditBaseline, setPayEditBaseline] = useState<PayEditBaseline | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<InvoiceStatus>("sent");
  const [bulkFeedback, setBulkFeedback] = useState("");
  const [sendWorking, setSendWorking] = useState(false);
  const [showSendPreview, setShowSendPreview] = useState(false);
  const [sendPreviewLoading, setSendPreviewLoading] = useState(false);
  const [sendPreviewFeedback, setSendPreviewFeedback] = useState("");
  const [sendComments, setSendComments] = useState("");
  const [sendPreview, setSendPreview] = useState<{
    to: string;
    subject: string;
    message: string;
    html: string;
    invoiceNumber: string;
    isResend: boolean;
  } | null>(null);
  const skipCommentsPreviewRef = useRef(false);

  useEffect(() => {
    setInvoices(initialInvoices);
    setSelectedIds((prev) => {
      const ids = new Set(initialInvoices.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [initialInvoices]);

  useEffect(() => {
    void fetch("/api/invoice-templates")
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((data) => setInvoiceTemplates(data.templates ?? []))
      .catch(() => setInvoiceTemplates([]));
  }, []);

  const modalOpen =
    showCreateModal || Boolean(editInvoiceId) || showBulkEditModal || showSendPreview;

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showSendPreview) closeSendPreview();
        else if (showBulkEditModal) setShowBulkEditModal(false);
        else if (showCreateModal) closeCreateModal();
        else closeEditModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, showCreateModal, showBulkEditModal, showSendPreview]);

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
    return data as {
      invoice: InvoiceRow;
      payments: PaymentRow[];
      paid_cents: number;
      activity: InvoiceActivityEvent[];
    };
  }

  function populateEditForm(data: {
    invoice: InvoiceRow;
    payments: PaymentRow[];
    activity?: InvoiceActivityEvent[];
  }) {
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
    setEditActivity(data.activity ?? []);
    setEditTitle(baseline.title);
    setEditAmount(baseline.amount);
    setEditDueDate(baseline.dueDate);
    setEditNotes(baseline.notes);
    setEditStatus(inv.status);
    setEditBaseline(baseline);
    setNewPayAmount("");
    setNewPayMethod("card");
    setNewPayNotes("");
    setNewPayReceipts([]);
    setEditingPaymentId(null);
    setPayEditReceipts([]);
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

  function resetCreateForm() {
    setAmount(CREATE_INVOICE_BASELINE.amount);
    setNotes(CREATE_INVOICE_BASELINE.notes);
    setDueDate(CREATE_INVOICE_BASELINE.dueDate);
    setTitle(CREATE_INVOICE_BASELINE.title);
    setRecurring(CREATE_INVOICE_BASELINE.recurring);
    setFrequency(CREATE_INVOICE_BASELINE.frequency);
    setEndOn(CREATE_INVOICE_BASELINE.endOn);
    setSendOnCreate(Boolean(contactEmail?.trim()));
    setSelectedTemplateId("");
    setCreateFeedback("");
  }

  function applyInvoiceTemplate(template: InvoiceTemplate) {
    const fields = templateToCreateFields(template);
    setTitle(fields.title);
    setAmount(fields.amount);
    setNotes(fields.notes);
    setEndOn("");
  }

  function openCreateModal() {
    setCreateFeedback("");
    setSendOnCreate(Boolean(contactEmail?.trim()));
    setSelectedTemplateId("");
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    resetCreateForm();
  }

  function cancelCreateForm() {
    resetCreateForm();
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
    setEditActivity([]);
    setEditBaseline(null);
    setEditFeedback("");
    setEditingPaymentId(null);
    setPayEditBaseline(null);
  }

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!createDirty) return;
    if (recurring && !dueDate) {
      setCreateFeedback("First due date is required for recurring invoices.");
      return;
    }
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
        recurring,
        frequency: recurring ? frequency : undefined,
        end_on: recurring && endOn ? endOn : null,
        send_email: sendOnCreate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateFeedback(data?.error ?? "Could not create invoice.");
      return;
    }
    closeCreateModal();
    if (sendOnCreate && data.send?.to) {
      setFeedback(`Invoice created and emailed to ${data.send.to}.`);
    } else if (sendOnCreate && data.send?.error) {
      setFeedback(`Invoice created, but the email could not be sent: ${data.send.error}`);
    } else {
      setFeedback(recurring ? "Recurring invoice created." : "Invoice created.");
    }
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
    const explanation = newPayNotes.trim();
    if (newPayMethod === "barter" && !explanation) {
      setEditFeedback("Describe the barter arrangement (what was exchanged).");
      return;
    }
    setEditFeedback("");

    let res: Response;
    if (newPayReceipts.length > 0) {
      const form = new FormData();
      form.set("amount", String(amt));
      form.set("method", newPayMethod);
      if (explanation) form.set("notes", explanation);
      for (const file of newPayReceipts) form.append("receipts", file);
      res = await fetch(`/api/invoices/${editInvoiceId}/payments`, {
        method: "POST",
        body: form,
      });
    } else {
      res = await fetch(`/api/invoices/${editInvoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          method: newPayMethod,
          notes: explanation || null,
        }),
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditFeedback(data?.error ?? "Could not record payment.");
      return;
    }
    setNewPayAmount("");
    setNewPayNotes("");
    setNewPayReceipts([]);
    const receipt = data.receipt as { sent?: boolean; to?: string; reason?: string } | undefined;
    if (receipt?.sent && receipt.to) {
      setFeedback(`Payment recorded. Receipt sent to ${receipt.to}.`);
    } else if (receipt?.reason === "no_email") {
      setFeedback("Payment recorded. Add a contact email to send receipts automatically.");
    } else if (receipt?.reason === "send_failed") {
      setFeedback("Payment recorded, but the receipt email could not be sent.");
    } else {
      setFeedback("Payment recorded.");
    }
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
    const explanation = payEditNotes.trim();
    if (payEditMethod === "barter" && !explanation) {
      setEditFeedback("Describe the barter arrangement (what was exchanged).");
      return;
    }
    setEditFeedback("");
    const res = await fetch(`/api/invoices/${editInvoiceId}/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amt,
        method: payEditMethod,
        notes: explanation || null,
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

  function toggleSelect(invoiceId: string) {
    setSelectionMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectionMode(true);
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((i) => i.id)));
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkFeedback("");
  }

  function enterSelectionMode() {
    setSelectionMode(true);
    setBulkFeedback("");
  }

  async function loadSendPreview(invoiceId: string, comments: string) {
    const params = new URLSearchParams();
    if (comments.trim()) params.set("comments", comments.trim());
    const qs = params.toString();
    const res = await fetch(
      `/api/invoices/${invoiceId}/send/preview${qs ? `?${qs}` : ""}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error ?? "Could not load preview.");
    }
    return data as {
      to: string;
      subject: string;
      message: string;
      html: string;
      invoiceNumber: string;
      isResend: boolean;
    };
  }

  function closeSendPreview() {
    setShowSendPreview(false);
    setSendPreview(null);
    setSendComments("");
    setSendPreviewFeedback("");
    setSendPreviewLoading(false);
  }

  async function openSendPreview(invoiceId: string) {
    setSendPreviewFeedback("");
    setSendComments("");
    setSendPreview(null);
    setShowSendPreview(true);
    setSendPreviewLoading(true);
    skipCommentsPreviewRef.current = true;
    try {
      const preview = await loadSendPreview(invoiceId, "");
      setSendPreview(preview);
    } catch (err) {
      setSendPreviewFeedback(err instanceof Error ? err.message : "Could not load preview.");
      setShowSendPreview(false);
    } finally {
      setSendPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (!showSendPreview || !editInvoiceId) return;
    if (skipCommentsPreviewRef.current) {
      skipCommentsPreviewRef.current = false;
      return;
    }
    const handle = window.setTimeout(async () => {
      setSendPreviewLoading(true);
      try {
        const preview = await loadSendPreview(editInvoiceId, sendComments);
        setSendPreview(preview);
        setSendPreviewFeedback("");
      } catch (err) {
        setSendPreviewFeedback(err instanceof Error ? err.message : "Could not update preview.");
      } finally {
        setSendPreviewLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [showSendPreview, editInvoiceId, sendComments]);

  async function confirmSendInvoice() {
    if (!editInvoiceId) return;
    setSendWorking(true);
    setSendPreviewFeedback("");
    try {
      const res = await fetch(`/api/invoices/${editInvoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: sendComments.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendPreviewFeedback(data?.error ?? "Could not send invoice.");
        return;
      }
      closeSendPreview();
      setFeedback(`Invoice emailed to ${data.to ?? "recipient"}.`);
      await reloadEditInvoice();
    } finally {
      setSendWorking(false);
    }
  }

  async function deleteInvoice(invoiceId: string) {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    setEditFeedback("");
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditFeedback(data?.error ?? "Could not delete invoice.");
      return;
    }
    closeEditModal();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(invoiceId);
      return next;
    });
    setFeedback("Invoice deleted.");
    await refresh();
  }

  async function runBulkAction(action: "resend" | "delete" | "update", status?: InvoiceStatus) {
    const ids = [...selectedIds];
    if (!ids.length) return;

    if (action === "delete") {
      const label = ids.length === 1 ? "this invoice" : `${ids.length} invoices`;
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    }

    setBulkWorking(true);
    setBulkFeedback("");
    setFeedback("");

    const res = await fetch(`/api/leads/${leadId}/invoices/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        invoiceIds: ids,
        ...(status ? { status } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setBulkFeedback(data?.error ?? "Bulk action failed.");
      setBulkWorking(false);
      return;
    }

    if (action === "resend") {
      const sent = data.sent ?? 0;
      const failed = data.failed ?? 0;
      if (failed === 0) {
        setFeedback(`Sent ${sent} invoice${sent === 1 ? "" : "s"}.`);
      } else {
        const firstErr = (data.results as { error?: string }[] | undefined)?.find((r) => r.error)?.error;
        setFeedback(`Sent ${sent}, failed ${failed}${firstErr ? `: ${firstErr}` : ""}.`);
      }
    } else if (action === "delete") {
      setFeedback(`Deleted ${data.deleted ?? ids.length} invoice${ids.length === 1 ? "" : "s"}.`);
      exitSelectionMode();
    } else {
      setFeedback(`Updated ${data.updated ?? ids.length} invoice${ids.length === 1 ? "" : "s"}.`);
      setShowBulkEditModal(false);
      setSelectedIds(new Set());
    }

    setBulkWorking(false);
    await refresh();
  }

  function openBulkEdit() {
    if (selectedIds.size === 1) {
      const inv = invoices.find((i) => selectedIds.has(i.id));
      if (inv) {
        exitSelectionMode();
        openEditInvoice(inv);
      }
      return;
    }
    setBulkFeedback("");
    setShowBulkEditModal(true);
  }

  const selectedCount = selectedIds.size;
  const allSelected = invoices.length > 0 && selectedCount === invoices.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected, selectionMode, selectedCount]);
  const hasContactEmail = Boolean(contactEmail?.trim());
  const canSendSelected = hasContactEmail;

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

  const createSendDefault = Boolean(contactEmail?.trim());
  const createDirty = isFormDirty(
    { title, amount, dueDate, notes, recurring, frequency, endOn, sendOnCreate },
    { ...CREATE_INVOICE_BASELINE, sendOnCreate: createSendDefault }
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
          {selectionMode ? (
            <>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all invoices"
                    className="size-4 rounded border-crm-border bg-crm-raised accent-crm-accent"
                  />
                  <span className="text-sm text-crm-text">
                    {selectedCount === 0
                      ? "Select invoices"
                      : `${selectedCount} of ${invoices.length} selected`}
                  </span>
                </label>
                {selectedCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runBulkAction("resend")}
                      disabled={bulkWorking || !canSendSelected}
                      className={crm.btn}
                      title={canSendSelected ? undefined : "Add a contact email first"}
                    >
                      {bulkWorking ? "Working…" : "Send"}
                    </button>
                    <button
                      type="button"
                      onClick={openBulkEdit}
                      disabled={bulkWorking}
                      className={crm.btn}
                    >
                      Edit status
                    </button>
                    <button
                      type="button"
                      onClick={() => runBulkAction("delete")}
                      disabled={bulkWorking}
                      className={`${crm.btn} text-red-400`}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
                {bulkFeedback ? <span className="text-xs text-red-400">{bulkFeedback}</span> : null}
              </div>
              <button type="button" onClick={exitSelectionMode} className={crm.btn}>
                Done
              </button>
            </>
          ) : (
            <>
              <div>
                <h2 className={crm.panelTitle}>Billing</h2>
                <p className={crm.panelHint}>
                  Outstanding {formatMoney(outstanding)} · Collected {formatMoney(collected)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {invoices.length > 0 ? (
                  <button type="button" onClick={enterSelectionMode} className={crm.btn}>
                    Select
                  </button>
                ) : null}
                <button
                  type="button"
            onClick={openCreateModal}
                  className={crm.btnPrimary}
                >
                  Create invoice
                </button>
              </div>
            </>
          )}
        </div>

        <div className={crm.panelBody}>
          {feedback && !modalOpen ? <p className="mb-3 text-xs text-crm-muted">{feedback}</p> : null}

          {!hasContactEmail && invoices.length > 0 ? (
            <p className="mb-3 text-xs text-amber-400/90">
              Add a contact email on this lead to send invoices.
            </p>
          ) : null}

          {invoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-crm-border/80 bg-crm-bg/35 px-4 py-10 text-center">
              <p className="text-sm font-medium text-crm-text">No invoices yet</p>
              <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-crm-faint">
                Create an invoice to track project fees and record payments.
              </p>
              <button type="button" onClick={openCreateModal} className={`${crm.btnPrimary} mt-5`}>
                Create invoice
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-crm-border/60 overflow-hidden rounded-xl border border-crm-border/70 bg-crm-bg/25">
              {invoices.map((inv) => {
                const paid = inv.paid_cents ?? (inv.status === "paid" ? inv.amount_cents : 0);
                const remaining = Math.max(0, inv.amount_cents - paid);
                const selected = selectedIds.has(inv.id);
                return (
                  <li key={inv.id} className={selected ? "bg-crm-raised/20" : undefined}>
                    <div className={`${crm.listRow} gap-3 sm:items-center`}>
                      {selectionMode ? (
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(inv.id)}
                          aria-label={`Select ${inv.invoice_number}`}
                          className="mt-0.5 size-4 shrink-0 rounded border-crm-border bg-crm-raised accent-crm-accent sm:mt-0"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openEditInvoice(inv)}
                        className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left hover:opacity-90 sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-xs text-crm-faint">{inv.invoice_number}</p>
                            {inv.schedule_id && inv.schedule_frequency ? (
                              <span className={crm.badge("neutral")}>
                                {RECURRING_FREQUENCY_LABEL[inv.schedule_frequency]}
                                {inv.schedule_active === false ? " · ended" : ""}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm font-medium text-crm-text">{inv.title}</p>
                          <p className="mt-0.5 text-xs text-crm-muted">
                            {formatMoney(inv.amount_cents, inv.currency)}
                            {paid > 0 ? ` · paid ${formatMoney(paid)}` : ""}
                            {remaining > 0 && inv.status !== "void" ? ` · due ${formatMoney(remaining)}` : ""}
                            {inv.due_date ? ` · due ${formatDateOnly(inv.due_date)}` : ""}
                          </p>
                        </div>
                        <span className={crm.badge(invoiceStatusTone(inv.status))}>
                          {INVOICE_STATUS_LABEL[inv.status]}
                        </span>
                      </button>
                    </div>
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
              {invoiceTemplates.length > 0 ? (
                <div className={crm.field}>
                  <label className={crm.fieldLabel}>Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedTemplateId(id);
                      const template = invoiceTemplates.find((t) => t.id === id);
                      if (template) applyInvoiceTemplate(template);
                      else {
                        setTitle(CREATE_INVOICE_BASELINE.title);
                        setAmount(CREATE_INVOICE_BASELINE.amount);
                        setNotes(CREATE_INVOICE_BASELINE.notes);
                        setRecurring(CREATE_INVOICE_BASELINE.recurring);
                        setFrequency(CREATE_INVOICE_BASELINE.frequency);
                        setEndOn(CREATE_INVOICE_BASELINE.endOn);
                      }
                    }}
                    className={`${crm.input} [color-scheme:dark]`}
                  >
                    <option value="">Custom invoice</option>
                    {invoiceTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {formatMoney(template.amount_cents, template.currency)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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
                  <label className={crm.fieldLabel}>
                    {recurring ? "First due date" : "Due date"}
                  </label>
                  <input
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    type="date"
                    required={recurring}
                    className={`${crm.input} [color-scheme:dark]`}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-crm-border bg-crm-bg/40 px-3 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-crm-border bg-crm-raised accent-crm-accent"
                  />
                  <span>
                    <span className="block text-sm font-medium text-crm-text">Make recurring</span>
                    <span className="mt-0.5 block text-xs text-crm-faint">
                      Creates this invoice now, then drafts the next one when each due date arrives.
                    </span>
                  </span>
                </label>
                {recurring ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className={crm.field}>
                      <label className={crm.fieldLabel}>Repeats</label>
                      <select
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                        className={`${crm.input} [color-scheme:dark]`}
                      >
                        {RECURRING_FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {RECURRING_FREQUENCY_LABEL[f]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={crm.field}>
                      <label className={crm.fieldLabel}>Ends on (optional)</label>
                      <input
                        value={endOn}
                        onChange={(e) => setEndOn(e.target.value)}
                        type="date"
                        min={dueDate || undefined}
                        className={`${crm.input} [color-scheme:dark]`}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-crm-border bg-crm-bg/40 px-3 py-3">
                <label
                  className={`flex items-start gap-3 ${hasContactEmail ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={sendOnCreate}
                    onChange={(e) => setSendOnCreate(e.target.checked)}
                    disabled={!hasContactEmail}
                    className="mt-0.5 size-4 rounded border-crm-border bg-crm-raised accent-crm-accent disabled:cursor-not-allowed"
                  />
                  <span>
                    <span className="block text-sm font-medium text-crm-text">
                      Send email notification
                    </span>
                    <span className="mt-0.5 block text-xs text-crm-faint">
                      {hasContactEmail
                        ? "Email the invoice to the lead when it’s created."
                        : "Add a contact email on this lead to send invoices."}
                    </span>
                  </span>
                </label>
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
                saveLabel={recurring ? "Create recurring invoice" : "Create invoice"}
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
                                      {PAYMENT_METHODS.map((m) => (
                                        <option key={m} value={m}>
                                          {PAYMENT_METHOD_LABEL[m]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <label className="block space-y-1.5">
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                    {payEditMethod === "barter" ? "Barter details" : "Notes"}
                                  </span>
                                  <input
                                    value={payEditNotes}
                                    onChange={(e) => setPayEditNotes(e.target.value)}
                                    required={payEditMethod === "barter"}
                                    placeholder={
                                      payEditMethod === "barter"
                                        ? "What was exchanged (meals, services, etc.)"
                                        : "Optional"
                                    }
                                    className={`${crm.input} py-2 text-xs`}
                                  />
                                </label>
                                {payEditMethod === "barter" ? (
                                  <p className="text-[11px] text-amber-400/90">
                                    Barter counts as taxable revenue — note what you received in exchange.
                                  </p>
                                ) : null}
                                <ReceiptFilePicker
                                  id={`pay-edit-receipts-${payment.id}`}
                                  files={payEditReceipts}
                                  onChange={setPayEditReceipts}
                                  label={
                                    payment.receipts?.length
                                      ? "Add more receipt photos"
                                      : "Receipt photos"
                                  }
                                />
                                {payment.receipts?.length ? (
                                  <ReceiptLinks receipts={payment.receipts} />
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                  <FormActions
                                    dirty={payEditDirty || payEditReceipts.length > 0}
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
                                  {payment.receipts?.length ? (
                                    <ReceiptLinks receipts={payment.receipts} />
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
                      <form onSubmit={addPayment} className={`${crm.card} mt-4 space-y-3 border-dashed p-3`}>
                        <p className={crm.fieldLabel}>Record payment</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              Amount
                            </span>
                            <div className="relative">
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
                          </label>
                          <label className="block space-y-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              Method
                            </span>
                            <select
                              value={newPayMethod}
                              onChange={(e) => setNewPayMethod(e.target.value as PaymentMethod)}
                              className={`${crm.input} py-2 text-xs`}
                            >
                              {PAYMENT_METHODS.map((m) => (
                                <option key={m} value={m}>
                                  {PAYMENT_METHOD_LABEL[m]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {newPayMethod === "barter" ? (
                          <div className="space-y-1.5">
                            <label className="block space-y-1.5">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                Barter details
                              </span>
                              <input
                                value={newPayNotes}
                                onChange={(e) => setNewPayNotes(e.target.value)}
                                required
                                placeholder="What was exchanged (meals, services, etc.)"
                                className={`${crm.input} py-2 text-xs`}
                              />
                            </label>
                            <p className="text-[11px] text-amber-400/90">
                              Barter counts as taxable revenue — note what you received in exchange.
                            </p>
                          </div>
                        ) : (
                          <label className="block space-y-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              Notes
                            </span>
                            <input
                              value={newPayNotes}
                              onChange={(e) => setNewPayNotes(e.target.value)}
                              placeholder="Optional"
                              className={`${crm.input} py-2 text-xs`}
                            />
                          </label>
                        )}
                        <ReceiptFilePicker
                          id="new-pay-receipts"
                          files={newPayReceipts}
                          onChange={setNewPayReceipts}
                        />
                        <div className="flex justify-end border-t border-crm-border/60 pt-3">
                          <button type="submit" className={crm.btnPrimary}>
                            Add payment
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>

                  <div className="border-t border-crm-border pt-5">
                    <h4 className={crm.fieldLabel}>Activity</h4>
                    <InvoiceActivityLog activity={editActivity} />
                  </div>

                  {editFeedback ? (
                    <p className="text-sm text-red-400">{editFeedback}</p>
                  ) : null}
                </div>
              )}
            </div>

            <div className={`${crm.modalFooter} sm:justify-between`}>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={closeEditModal} className={crm.btn}>
                  Close
                </button>
                {editInvoice && editInvoice.status !== "void" && editInvoice.status !== "paid" ? (
                  <button
                    type="button"
                    onClick={() => openSendPreview(editInvoice.id)}
                    disabled={sendWorking || sendPreviewLoading || !hasContactEmail}
                    className={crm.btn}
                    title={hasContactEmail ? undefined : "Add a contact email first"}
                  >
                    {editInvoice.status === "draft" ? "Send invoice" : "Resend invoice"}
                  </button>
                ) : null}
                {editInvoice ? (
                  <button
                    type="button"
                    onClick={() => deleteInvoice(editInvoice.id)}
                    disabled={sendWorking}
                    className={`${crm.btnGhost} text-red-400`}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <FormActions
                dirty={editInvoiceDirty}
                isPending={isPending || editLoading || sendWorking}
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

      {showSendPreview ? (
        <div
          className={`${crm.modalBackdrop} z-[60]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-invoice-preview-title"
        >
          <button
            type="button"
            className={crm.modalOverlay}
            onClick={closeSendPreview}
            aria-label="Close"
          />
          <div className={crm.modalPanelWide}>
            <div className={crm.modalHeader}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="send-invoice-preview-title" className="text-lg font-semibold text-crm-text">
                    {sendPreview?.isResend ? "Resend invoice" : "Send invoice"}
                  </h3>
                  <p className="mt-1 text-sm text-crm-muted">
                    {sendPreview
                      ? `${sendPreview.invoiceNumber} → ${sendPreview.to}`
                      : "Loading preview…"}
                  </p>
                </div>
                <button type="button" onClick={closeSendPreview} className={crm.btnGhost} aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            <div className={`${crm.modalBody} space-y-4`}>
              <label className="block space-y-2">
                <span className={crm.fieldLabel}>Comments</span>
                <textarea
                  value={sendComments}
                  onChange={(e) => setSendComments(e.target.value)}
                  placeholder="Add a personal note (optional) — appears above the invoice details"
                  rows={3}
                  className={`${crm.input} resize-none leading-relaxed`}
                  autoFocus
                />
              </label>

              <div>
                <p className={crm.fieldLabel}>Preview</p>
                {sendPreview ? (
                  <div className="mt-2 overflow-hidden rounded-xl border border-crm-border/70 bg-[#f0ebe3]">
                    <div className="border-b border-crm-border/50 bg-crm-raised/30 px-3 py-2">
                      <p className="truncate text-xs text-crm-muted">
                        <span className="text-crm-faint">Subject:</span> {sendPreview.subject}
                      </p>
                    </div>
                    <iframe
                      title="Invoice email preview"
                      srcDoc={sendPreview.html}
                      className="block h-[min(22rem,50vh)] w-full border-0 bg-[#faf8f5]"
                      sandbox=""
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-crm-faint">Loading preview…</p>
                )}
                {sendPreviewLoading ? (
                  <p className="mt-2 text-xs text-crm-faint">Updating preview…</p>
                ) : null}
              </div>

              {sendPreviewFeedback ? (
                <p className="text-sm text-red-400">{sendPreviewFeedback}</p>
              ) : null}
            </div>

            <div className={`${crm.modalFooter} sm:justify-between`}>
              <button type="button" onClick={closeSendPreview} className={crm.btn} disabled={sendWorking}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSendInvoice()}
                disabled={sendWorking || sendPreviewLoading || !sendPreview}
                className={crm.btnPrimary}
              >
                {sendWorking ? "Sending…" : sendPreview?.isResend ? "Resend invoice" : "Send invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBulkEditModal ? (
        <div className={crm.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title">
          <button
            type="button"
            className={crm.modalOverlay}
            onClick={() => setShowBulkEditModal(false)}
            aria-label="Close"
          />
          <div className={crm.modalPanel}>
            <div className={crm.modalHeader}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="bulk-edit-title" className="text-lg font-semibold text-crm-text">
                    Edit {selectedCount} invoices
                  </h3>
                  <p className="mt-1 text-sm text-crm-muted">
                    Update status for all selected invoices.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkEditModal(false)}
                  className={crm.btnGhost}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <div className={`${crm.modalBody} space-y-4`}>
              <label className="block space-y-2">
                <span className={crm.fieldLabel}>Status</span>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as InvoiceStatus)}
                  className={crm.input}
                >
                  {INVOICE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {INVOICE_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              {bulkFeedback ? <p className="text-sm text-red-400">{bulkFeedback}</p> : null}
            </div>
            <div className={crm.modalFooter}>
              <button
                type="button"
                onClick={() => setShowBulkEditModal(false)}
                disabled={bulkWorking}
                className={crm.btn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => runBulkAction("update", bulkStatus)}
                disabled={bulkWorking}
                className={crm.btnPrimary}
              >
                {bulkWorking ? "Updating…" : "Update status"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
