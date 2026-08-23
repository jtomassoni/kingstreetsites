"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/billing";
import { crm } from "@/lib/admin-ui";
import FormActions, { isFormDirty } from "@/app/admin/components/form-actions";
import type { InvoiceTemplate } from "@/lib/invoice-templates";

const EMPTY_FORM = {
  name: "",
  title: "",
  amount: "",
  notes: "",
};

export default function InvoiceTemplatesPanel() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);
  const [formFeedback, setFormFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const skipPreviewRef = useRef(false);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/invoice-templates");
    if (res.ok) {
      const data = await res.json();
      setTemplates(data.templates ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const dirty = modalOpen && isFormDirty(form, baseline);

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setFormFeedback("");
    setPreview(null);
  }

  const loadPreview = useCallback(async (draft: typeof EMPTY_FORM) => {
    if (!draft.title.trim() || !draft.amount) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/invoice-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          amount: Number(draft.amount),
          notes: draft.notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreview(null);
        return;
      }
      setPreview({ subject: data.subject, html: data.html });
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    if (skipPreviewRef.current) {
      skipPreviewRef.current = false;
      void loadPreview(form);
      return;
    }
    const handle = window.setTimeout(() => {
      void loadPreview(form);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [modalOpen, form, loadPreview]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setBaseline(EMPTY_FORM);
    setFormFeedback("");
    setPreview(null);
    skipPreviewRef.current = true;
    setModalOpen(true);
  }

  function openEdit(template: InvoiceTemplate) {
    const next = {
      name: template.name,
      title: template.title,
      amount: (template.amount_cents / 100).toFixed(2),
      notes: template.notes ?? "",
    };
    setEditingId(template.id);
    setForm(next);
    setBaseline(next);
    setFormFeedback("");
    setPreview(null);
    skipPreviewRef.current = true;
    setModalOpen(true);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setFormFeedback("");

    const payload = {
      name: form.name.trim(),
      title: form.title.trim(),
      amount: Number(form.amount),
      notes: form.notes.trim() || null,
    };

    const res = await fetch(
      editingId ? `/api/invoice-templates/${editingId}` : "/api/invoice-templates",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setFormFeedback(data?.error ?? "Could not save template.");
      return;
    }

    closeModal();
    setFeedback(editingId ? "Template updated." : "Template created.");
    await loadTemplates();
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("Delete this template?")) return;
    setFeedback("");
    const res = await fetch(`/api/invoice-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFeedback(data?.error ?? "Could not delete template.");
      return;
    }
    setFeedback("Template deleted.");
    await loadTemplates();
  }

  return (
    <>
      <div className={`${crm.panel} mb-6`}>
        <div className={`${crm.panelHeader} flex flex-wrap items-start justify-between gap-3`}>
          <div>
            <h2 className={crm.panelTitle}>Invoice templates</h2>
            <p className={crm.panelHint}>
              Reusable packages — apply when creating an invoice on any lead or customer.
            </p>
          </div>
          <button type="button" onClick={openCreate} className={crm.btnPrimary}>
            New template
          </button>
        </div>

        <div className={crm.panelBody}>
          {feedback ? <p className="mb-3 text-xs text-crm-muted">{feedback}</p> : null}

          {loading ? (
            <p className="text-sm text-crm-faint">Loading templates…</p>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-crm-border/80 bg-crm-bg/35 px-4 py-8 text-center">
              <p className="text-sm font-medium text-crm-text">No templates yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-crm-faint">
                Save your standard packages (e.g. $99/mo starter, $199/mo pro) to bill leads faster.
              </p>
              <button type="button" onClick={openCreate} className={`${crm.btnPrimary} mt-4`}>
                Create template
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-crm-border/60 overflow-hidden rounded-xl border border-crm-border/70 bg-crm-bg/25">
              {templates.map((template) => (
                <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-crm-text">{template.name}</p>
                    <p className="mt-0.5 text-xs text-crm-muted">
                      {template.title} · {formatMoney(template.amount_cents, template.currency)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => openEdit(template)} className={crm.btn}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTemplate(template.id)}
                      className={`${crm.btnGhost} text-red-400`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modalOpen ? (
        <div className={crm.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="template-form-title">
          <button type="button" className={crm.modalOverlay} onClick={closeModal} aria-label="Close" />
          <div className={crm.modalPanelWide}>
            <div className={crm.modalHeader}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="template-form-title" className="text-lg font-semibold text-crm-text">
                    {editingId ? "Edit template" : "New template"}
                  </h3>
                  <p className="mt-1 text-sm text-crm-muted">
                    Short name for your list; title and amount fill the invoice form.
                  </p>
                </div>
                <button type="button" onClick={closeModal} className={crm.btnGhost} aria-label="Close">
                  ×
                </button>
              </div>
            </div>

            <form id="template-form" onSubmit={saveTemplate} className={`${crm.modalBody} space-y-4`}>
              <div className={crm.field}>
                <label className={crm.fieldLabel}>Template name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="$99/mo Starter"
                  required
                  autoFocus
                  className={crm.input}
                />
              </div>
              <div className={crm.field}>
                <label className={crm.fieldLabel}>Invoice title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Website hosting — Starter"
                  required
                  className={crm.input}
                />
              </div>
              <div className={crm.field}>
                <label className={crm.fieldLabel}>Amount</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-crm-faint">
                    $
                  </span>
                  <input
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    className={`${crm.input} pl-7 tabular-nums`}
                  />
                </div>
              </div>

              <div className={crm.field}>
                <label className={crm.fieldLabel}>Default notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Scope, what's included…"
                  rows={3}
                  className={`${crm.input} resize-none`}
                />
              </div>

              {formFeedback ? <p className="text-sm text-red-400">{formFeedback}</p> : null}

              <div>
                <p className={crm.fieldLabel}>Invoice email preview</p>
                <p className="mt-1 text-xs text-crm-faint">
                  How the notification email will look when this template is sent to a customer.
                </p>
                {preview ? (
                  <div className="mt-2 overflow-hidden rounded-xl border border-crm-border/70 bg-[#f0ebe3]">
                    <div className="border-b border-crm-border/50 bg-crm-raised/30 px-3 py-2">
                      <p className="truncate text-xs text-crm-muted">
                        <span className="text-crm-faint">Subject:</span> {preview.subject}
                      </p>
                    </div>
                    <iframe
                      title="Template invoice email preview"
                      srcDoc={preview.html}
                      className="block h-[min(20rem,45vh)] w-full border-0 bg-[#faf8f5]"
                      sandbox=""
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-crm-faint">
                    {previewLoading ? "Loading preview…" : "Enter a title and amount to preview."}
                  </p>
                )}
                {previewLoading && preview ? (
                  <p className="mt-2 text-xs text-crm-faint">Updating preview…</p>
                ) : null}
              </div>
            </form>

            <div className={crm.modalFooter}>
              <FormActions
                dirty={dirty}
                isPending={saving}
                saveLabel={editingId ? "Save template" : "Create template"}
                formId="template-form"
                onCancel={() => {
                  setForm(baseline);
                  setFormFeedback("");
                }}
                feedback={formFeedback}
                className="pt-0"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
