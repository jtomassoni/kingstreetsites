"use client";

import { useState, useTransition } from "react";
import {
  addCommentAction,
  deleteCommentAction,
} from "@projects/actions/projects";
import type {
  CommentTargetType,
  HouseProjectComment,
} from "@projects/types";

export function CommentThread({
  projectId,
  targetType,
  targetId,
  comments,
  onChanged,
}: {
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
  comments: HouseProjectComment[];
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mine = comments.filter(
    (c) => c.target_type === targetType && c.target_id === targetId,
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addCommentAction({
        projectId,
        targetType,
        targetId,
        body,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      onChanged();
    });
  }

  return (
    <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
        Comments
      </p>
      {mine.length === 0 ? (
        <p className="text-xs text-ink-muted">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((c) => (
            <li
              key={c.id}
              className="rounded-lg bg-cream/80 px-3 py-2 text-sm text-ink"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap leading-relaxed">{c.body}</p>
                <button
                  type="button"
                  disabled={pending}
                  className="shrink-0 text-xs text-ink-faint hover:text-red-700"
                  onClick={() => {
                    startTransition(async () => {
                      await deleteCommentAction(projectId, c.id);
                      onChanged();
                    });
                  }}
                >
                  Delete
                </button>
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">
                {c.author_display_name || "Someone"} ·{" "}
                {new Date(c.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="min-h-11 flex-1 rounded-xl border border-ink/10 bg-cream px-3.5 py-2.5 text-sm text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          Post
        </button>
      </form>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
