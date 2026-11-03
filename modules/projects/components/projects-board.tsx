"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  createProjectAction,
  deleteProjectAction,
  listProjectsAction,
  moveProjectGroupAction,
  reorderProjectAction,
  updateProjectAction,
} from "@projects/actions/projects";
import { BOARD_GROUP_LABELS } from "@projects/lib/board";
import { CostSummary } from "@projects/components/cost-summary";
import { MenuSelect } from "@projects/components/menu-select";
import { BOARD_GROUPS, type BoardGroup, type ProjectListItem } from "@projects/types";

const BOARD_GROUP_OPTIONS = BOARD_GROUPS.map((g) => ({
  value: g,
  label: BOARD_GROUP_LABELS[g],
}));

export function ProjectsBoard({
  initialProjects,
}: {
  initialProjects: ProjectListItem[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [boardGroup, setBoardGroup] = useState<BoardGroup>("backlog");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh(includeArchived = showArchived) {
    startTransition(async () => {
      const res = await listProjectsAction(includeArchived);
      if (res.projects) setProjects(res.projects);
      if (res.error) setError(res.error);
    });
  }

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      BOARD_GROUPS.map((g) => [g, [] as ProjectListItem[]]),
    ) as Record<BoardGroup, ProjectListItem[]>;
    for (const p of projects) {
      if (!showArchived && p.archived) continue;
      map[p.board_group].push(p);
    }
    return map;
  }, [projects, showArchived]);

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createProjectAction({
        title,
        description,
        boardGroup,
        budget: budget || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setTitle("");
      setDescription("");
      setBudget("");
      setBoardGroup("backlog");
      refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand sm:text-sm">
            House Projects
          </p>
          <h1 className="mt-1 font-serif text-[1.85rem] tracking-tight text-ink sm:mt-2 sm:text-4xl">
            Projects
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted sm:text-base">
            Big home work with budgets, estimates, and actuals — shared for the
            household.
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              const next = e.target.checked;
              setShowArchived(next);
              refresh(next);
            }}
            className="size-4 rounded border-ink/20"
          />
          Show archived
        </label>
      </header>

      <form
        onSubmit={onCreate}
        className="mt-8 space-y-3 rounded-2xl border border-ink/10 bg-white/60 p-4 sm:p-5"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
          New project
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Project title"
          className="min-h-11 w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-2.5 text-sm text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-2.5 text-sm text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2"
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <MenuSelect
            aria-label="Board group"
            value={boardGroup}
            options={BOARD_GROUP_OPTIONS}
            onChange={(v) => setBoardGroup(v as BoardGroup)}
            className="sm:min-w-[10.5rem]"
          />
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="Budget $"
            inputMode="decimal"
            className="min-h-11 flex-1 rounded-xl border border-ink/10 bg-cream px-3.5 py-2.5 text-sm text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2"
          />
          <button
            type="submit"
            disabled={pending || !title.trim()}
            className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </form>

      <div className="mt-10 space-y-8">
        {BOARD_GROUPS.map((group) => {
          const items = grouped[group];
          return (
            <section key={group}>
              <h2 className="flex items-baseline gap-2 font-serif text-xl text-ink">
                {BOARD_GROUP_LABELS[group]}
                <span className="text-sm font-sans font-normal text-ink-faint">
                  {items.length}
                </span>
              </h2>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">Nothing here.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {items.map((p, index) => (
                    <li
                      key={p.id}
                      className={`rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 ${
                        p.archived ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/tools/projects/${p.id}`}
                            className="font-semibold text-ink hover:text-brand"
                          >
                            {p.title}
                          </Link>
                          {p.description ? (
                            <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">
                              {p.description}
                            </p>
                          ) : null}
                          <div className="mt-2">
                            <CostSummary rollup={p.rollup} compact />
                            <p className="mt-1 text-[11px] text-ink-faint">
                              {p.sub_project_count} sub-projects ·{" "}
                              {p.open_item_count} open items
                              {p.archived ? " · archived" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={pending || index === 0}
                            title="Higher priority"
                            className="min-h-9 rounded-lg border border-ink/10 px-2 text-xs text-ink-muted hover:bg-cream disabled:opacity-40"
                            onClick={() => {
                              startTransition(async () => {
                                await reorderProjectAction(p.id, "up");
                                refresh();
                              });
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={pending || index === items.length - 1}
                            title="Lower priority"
                            className="min-h-9 rounded-lg border border-ink/10 px-2 text-xs text-ink-muted hover:bg-cream disabled:opacity-40"
                            onClick={() => {
                              startTransition(async () => {
                                await reorderProjectAction(p.id, "down");
                                refresh();
                              });
                            }}
                          >
                            ↓
                          </button>
                          <MenuSelect
                            aria-label={`Move ${p.title}`}
                            value={p.board_group}
                            disabled={pending}
                            options={BOARD_GROUP_OPTIONS}
                            buttonClassName="flex min-h-9 items-center justify-between gap-1.5 rounded-lg border border-ink/10 bg-cream px-2 text-sm text-ink disabled:opacity-50"
                            onChange={(next) => {
                              startTransition(async () => {
                                await moveProjectGroupAction(p.id, next);
                                refresh();
                              });
                            }}
                          />
                          <button
                            type="button"
                            disabled={pending}
                            className="min-h-9 rounded-lg border border-ink/10 px-2 text-xs text-ink-muted hover:bg-cream"
                            onClick={() => {
                              startTransition(async () => {
                                await updateProjectAction({
                                  projectId: p.id,
                                  archived: !p.archived,
                                });
                                refresh();
                              });
                            }}
                          >
                            {p.archived ? "Unarchive" : "Archive"}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="min-h-9 rounded-lg border border-ink/10 px-2 text-xs text-red-700/80 hover:bg-red-50"
                            onClick={() => {
                              if (
                                !confirm(
                                  `Delete “${p.title}”? This removes sub-projects, line items, and comments.`,
                                )
                              ) {
                                return;
                              }
                              startTransition(async () => {
                                await deleteProjectAction(p.id);
                                refresh();
                              });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
