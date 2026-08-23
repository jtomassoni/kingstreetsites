"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crm } from "@/lib/admin-ui";
import { useToast } from "@/app/admin/components/toast";
import type { LeadSiteIssue } from "@/lib/lead-site-issues";

type LeadSiteIssuesPanelProps = {
  leadId: string;
  initialIssues: LeadSiteIssue[];
};

export default function LeadSiteIssuesPanel({
  leadId,
  initialIssues,
}: LeadSiteIssuesPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [issues, setIssues] = useState(initialIssues);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function uploadScreenshot(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || uploading) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (description.trim()) form.set("description", description.trim());

      const res = await fetch(`/api/leads/${leadId}/site-issues`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          tone: "error",
          title: "Upload failed",
          description: data?.error ?? "Could not upload screenshot.",
        });
        return;
      }

      if (data.issue) {
        setIssues((prev) => [...prev, data.issue as LeadSiteIssue]);
      }
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      toast({ tone: "success", title: "Screenshot added" });
      startTransition(() => router.refresh());
    } catch {
      toast({
        tone: "error",
        title: "Upload failed",
        description: "Network error. Try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function saveDescription(issueId: string) {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/site-issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDescription }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          tone: "error",
          title: "Could not save",
          description: data?.error ?? "Something went wrong.",
        });
        return;
      }

      if (data.issue) {
        setIssues((prev) =>
          prev.map((issue) => (issue.id === issueId ? (data.issue as LeadSiteIssue) : issue))
        );
      }
      setEditingId(null);
      toast({ tone: "success", title: "Description saved" });
      startTransition(() => router.refresh());
    } catch {
      toast({
        tone: "error",
        title: "Could not save",
        description: "Network error. Try again.",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteIssue(issueId: string) {
    if (deletingId) return;
    setDeletingId(issueId);
    try {
      const res = await fetch(`/api/leads/${leadId}/site-issues/${issueId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          tone: "error",
          title: "Could not delete",
          description: data?.error ?? "Something went wrong.",
        });
        return;
      }

      setIssues((prev) => prev.filter((issue) => issue.id !== issueId));
      toast({ tone: "success", title: "Screenshot removed" });
      startTransition(() => router.refresh());
    } catch {
      toast({
        tone: "error",
        title: "Could not delete",
        description: "Network error. Try again.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className={crm.card}>
      <h2 className={crm.sectionTitle}>Site issues</h2>
      <p className="mb-3 text-sm leading-relaxed text-crm-muted">
        Upload screenshots of problems on their current site. Include them in pitch emails to show
        specific mistakes.
      </p>

      {issues.length > 0 ? (
        <ul className="mb-4 space-y-3">
          {issues.map((issue, index) => (
            <li
              key={issue.id}
              className="overflow-hidden rounded-lg border border-crm-border/70 bg-crm-surface/50"
            >
              <div className="relative aspect-video w-full bg-crm-raised/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={issue.image_url}
                  alt={issue.description || `Site issue ${index + 1}`}
                  className="h-full w-full object-cover object-top"
                />
              </div>
              <div className="space-y-2 p-3">
                {editingId === issue.id ? (
                  <>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                      className={crm.textarea}
                      placeholder="What's wrong here? e.g. Menu is a PDF on mobile"
                      disabled={savingEdit}
                    />
                    <div className={crm.formActions}>
                      <button
                        type="button"
                        onClick={() => void saveDescription(issue.id)}
                        disabled={savingEdit}
                        className={crm.btnPrimary}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={savingEdit}
                        className={crm.btn}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-crm-text">
                      <span className="mr-1.5 font-medium text-crm-faint">{index + 1}.</span>
                      {issue.description.trim() || (
                        <span className="italic text-crm-faint">No description yet</span>
                      )}
                    </p>
                    <div className={crm.formActions}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(issue.id);
                          setEditDescription(issue.description);
                        }}
                        className={`${crm.btnGhost} text-xs`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteIssue(issue.id)}
                        disabled={deletingId === issue.id}
                        className={`${crm.btnGhost} text-xs text-red-400/90 hover:text-red-300`}
                      >
                        {deletingId === issue.id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-crm-faint">No screenshots yet — add one below.</p>
      )}

      <form onSubmit={uploadScreenshot} className="space-y-3 border-t border-crm-border/60 pt-3">
        <div className={crm.field}>
          <label className={crm.fieldLabel} htmlFor={`site-issue-file-${leadId}`}>
            Screenshot
          </label>
          <input
            id={`site-issue-file-${leadId}`}
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            className="block w-full text-sm text-crm-muted file:mr-3 file:rounded-md file:border-0 file:bg-crm-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-crm-text"
          />
        </div>
        <div className={crm.field}>
          <label className={crm.fieldLabel} htmlFor={`site-issue-desc-${leadId}`}>
            What&apos;s wrong?
          </label>
          <input
            id={`site-issue-desc-${leadId}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Hours are buried — hard to find on mobile"
            disabled={uploading}
            className={crm.input}
          />
        </div>
        <button type="submit" disabled={uploading} className={crm.btn}>
          {uploading ? "Uploading…" : "Add screenshot"}
        </button>
      </form>
    </section>
  );
}

export type { LeadSiteIssue };
