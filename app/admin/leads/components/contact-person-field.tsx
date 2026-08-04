"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crm } from "@/lib/admin-ui";
import FormActions, { isFormDirty } from "@/app/admin/components/form-actions";

const ROLES = [
  { value: "", label: "Select role…" },
  { value: "owner", label: "Owner" },
  { value: "gm", label: "General Manager" },
  { value: "manager", label: "Manager" },
  { value: "other", label: "Other" },
];

function sourceLabel(source: string | null | undefined) {
  if (!source) return null;
  const labels: Record<string, string> = {
    manual: "Manual entry",
    website_homepage: "Found on website",
    website_contact: "Contact page",
    website_about: "About page",
    website_team: "Team page",
    generic_fallback: "Generic inbox",
  };
  return labels[source] ?? source.replaceAll("_", " ");
}

export default function ContactPersonField({
  leadId,
  initialName,
  initialRole,
  initialEmail,
  initialSource,
}: {
  leadId: string;
  initialName?: string | null;
  initialRole?: string | null;
  initialEmail?: string | null;
  initialSource?: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [role, setRole] = useState(initialRole ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [source, setSource] = useState(initialSource ?? "");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");

  const baseline = useMemo(
    () => ({
      name: initialName ?? "",
      role: initialRole ?? "",
      email: initialEmail ?? "",
    }),
    [initialName, initialRole, initialEmail]
  );

  const dirty = isFormDirty({ name, role, email }, baseline);

  useEffect(() => {
    setName(initialName ?? "");
    setRole(initialRole ?? "");
    setEmail(initialEmail ?? "");
    setSource(initialSource ?? "");
  }, [initialName, initialRole, initialEmail, initialSource]);

  function cancel() {
    setName(baseline.name);
    setRole(baseline.role);
    setEmail(baseline.email);
    setFeedback("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setFeedback("");
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_name: name,
        contact_role: role,
        contact_email: email,
        contact_email_source: "manual",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(data?.error ?? "Could not save.");
      return;
    }
    setSource("manual");
    setFeedback("Saved");
    startTransition(() => router.refresh());
  }

  const isGeneric = source === "generic_fallback";

  return (
    <form onSubmit={save} className="space-y-3">
      {source ? (
        <p className={`text-xs ${isGeneric ? "text-amber-400" : "text-crm-faint"}`}>
          {sourceLabel(source)}
          {isGeneric ? " — no personal email found on their site" : ""}
        </p>
      ) : null}

      <div className={crm.field}>
        <label className={crm.fieldLabel} htmlFor={`contact-name-${leadId}`}>
          Name
        </label>
        <input
          id={`contact-name-${leadId}`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Maria Lopez"
          className={crm.input}
        />
      </div>

      <div className={crm.field}>
        <label className={crm.fieldLabel} htmlFor={`contact-role-${leadId}`}>
          Role
        </label>
        <select
          id={`contact-role-${leadId}`}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={crm.input}
        >
          {ROLES.map((r) => (
            <option key={r.value || "none"} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className={crm.field}>
        <label className={crm.fieldLabel} htmlFor={`contact-email-${leadId}`}>
          Email
        </label>
        <input
          id={`contact-email-${leadId}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="maria@restaurant.com"
          className={crm.input}
        />
      </div>

      <FormActions
        dirty={dirty}
        isPending={isPending}
        saveLabel="Save contact"
        onCancel={cancel}
        feedback={feedback}
      />
    </form>
  );
}
