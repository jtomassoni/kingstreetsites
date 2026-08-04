"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crm } from "@/lib/admin-ui";
import FormActions, { isFormDirty } from "@/app/admin/components/form-actions";

const EMPTY_FORM = {
  business_name: "",
  contact_name: "",
  contact_role: "",
  contact_email: "",
  phone: "",
  website_url: "",
  address: "",
  metro: "",
  zip: "",
  cuisine: "",
};

export default function AddLeadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const dirty = isFormDirty(form, EMPTY_FORM);
  const canCreate = dirty && Boolean(form.business_name.trim());

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function close() {
    setOpen(false);
    setError("");
    setForm(EMPTY_FORM);
  }

  function cancel() {
    setForm(EMPTY_FORM);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
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
    close();
    startTransition(() => {
      router.push(`/admin/leads/${data.lead.id}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={crm.btnPrimary}>
        Add lead
      </button>
    );
  }

  return (
    <div className={crm.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="add-lead-title">
      <button type="button" className={crm.modalOverlay} onClick={close} aria-label="Close" />
      <div className={`${crm.modalPanelWide} max-h-[90vh] flex flex-col`}>
        <div className={crm.modalHeader}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="add-lead-title" className="text-lg font-semibold text-crm-text">
                Add lead manually
              </h2>
              <p className="mt-1 text-sm text-crm-muted">Creates a record and opens the detail page.</p>
            </div>
            <button type="button" onClick={close} className={crm.btnGhost} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <form id="add-lead-form" onSubmit={submit} className={`${crm.modalBody} space-y-4`}>
          <div className={crm.field}>
            <label className={crm.fieldLabel}>Business name *</label>
            <input
              required
              value={form.business_name}
              onChange={(e) => update("business_name", e.target.value)}
              className={crm.input}
              placeholder="Harbor Grill"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={crm.field}>
              <label className={crm.fieldLabel}>Contact name</label>
              <input
                value={form.contact_name}
                onChange={(e) => update("contact_name", e.target.value)}
                className={crm.input}
                placeholder="Maria Lopez"
              />
            </div>
            <div className={crm.field}>
              <label className={crm.fieldLabel}>Role</label>
              <select
                value={form.contact_role}
                onChange={(e) => update("contact_role", e.target.value)}
                className={crm.input}
              >
                <option value="">—</option>
                <option value="owner">Owner</option>
                <option value="gm">General Manager</option>
                <option value="manager">Manager</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className={crm.field}>
              <label className={crm.fieldLabel}>Contact email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => update("contact_email", e.target.value)}
                className={crm.input}
                placeholder="maria@restaurant.com"
              />
            </div>
            <div className={crm.field}>
              <label className={crm.fieldLabel}>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className={crm.input}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className={crm.field}>
            <label className={crm.fieldLabel}>Website</label>
            <input
              value={form.website_url}
              onChange={(e) => update("website_url", e.target.value)}
              className={crm.input}
              placeholder="https://"
            />
          </div>

          <div className={crm.field}>
            <label className={crm.fieldLabel}>Address</label>
            <input value={form.address} onChange={(e) => update("address", e.target.value)} className={crm.input} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={crm.field}>
              <label className={crm.fieldLabel}>Metro</label>
              <input
                value={form.metro}
                onChange={(e) => update("metro", e.target.value)}
                className={crm.input}
                placeholder="Alexandria"
              />
            </div>
            <div className={crm.field}>
              <label className={crm.fieldLabel}>ZIP</label>
              <input
                value={form.zip}
                onChange={(e) => update("zip", e.target.value)}
                className={crm.input}
                placeholder="22314"
              />
            </div>
          </div>

          <div className={crm.field}>
            <label className={crm.fieldLabel}>Cuisine / type</label>
            <input
              value={form.cuisine}
              onChange={(e) => update("cuisine", e.target.value)}
              className={crm.input}
              placeholder="Italian, cafe, bar…"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>

        <div className={crm.modalFooter}>
          <FormActions
            dirty={dirty}
            saveEnabled={canCreate}
            isPending={isPending}
            saveLabel={isPending ? "Saving…" : "Create lead"}
            formId="add-lead-form"
            onCancel={cancel}
            className="pt-0"
          />
        </div>
      </div>
    </div>
  );
}
