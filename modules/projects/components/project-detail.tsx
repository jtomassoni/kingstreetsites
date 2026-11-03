"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { listCommentsAction } from "@projects/actions/comments";
import {
  createLineItemAction,
  createSubProjectAction,
  deleteLineItemAction,
  deleteProjectAction,
  deleteSubProjectAction,
  getProjectDetailAction,
  moveProjectGroupAction,
  reorderLineItemAction,
  reorderSubProjectAction,
  updateLineItemAction,
  updateProjectAction,
  updateSubProjectAction,
} from "@projects/actions/projects";
import { assigneeLabel } from "@projects/lib/assignee";
import { BOARD_GROUP_LABELS } from "@projects/lib/board";
import { centsToInputValue, formatCents } from "@projects/lib/money";
import { CommentThread } from "@projects/components/comment-thread";
import { CostSummary } from "@projects/components/cost-summary";
import {
  ASSIGNEES,
  BOARD_GROUPS,
  WORK_STATUSES,
  type BoardGroup,
  type HouseProjectComment,
  type ProjectDetail,
  type WorkStatus,
} from "@projects/types";

type Props = {
  initialProject: ProjectDetail;
  initialComments: HouseProjectComment[];
};

export function ProjectDetailApp({
  initialProject,
  initialComments,
}: Props) {
  const [project, setProject] = useState(initialProject);
  const [comments, setComments] = useState(initialComments);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [editTitle, setEditTitle] = useState(project.title);
  const [editDesc, setEditDesc] = useState(project.description ?? "");
  const [editBudget, setEditBudget] = useState(
    centsToInputValue(project.budget_cents),
  );

  const [subTitle, setSubTitle] = useState("");
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({
    [`project:${project.id}`]: true,
  });

  function refresh() {
    startTransition(async () => {
      const res = await getProjectDetailAction(project.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.project) {
        setProject(res.project);
        setEditTitle(res.project.title);
        setEditDesc(res.project.description ?? "");
        setEditBudget(centsToInputValue(res.project.budget_cents));
      }
      const cRes = await listCommentsAction(project.id);
      if (cRes.comments) setComments(cRes.comments);
    });
  }

  function refreshCommentsOnly() {
    startTransition(async () => {
      const cRes = await listCommentsAction(project.id);
      if (cRes.comments) setComments(cRes.comments);
    });
  }

  const commentKey = (type: string, id: string) => `${type}:${id}`;

  return (
    <div className="mx-auto max-w-3xl px-3 py-8 sm:px-6 sm:py-12">
      <p className="mb-4">
        <Link
          href="/tools/projects"
          className="text-sm font-semibold text-brand hover:text-brand-dark"
        >
          ← All projects
        </Link>
      </p>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={project.board_group}
            disabled={pending}
            className="min-h-9 rounded-lg border border-ink/10 bg-cream px-2 text-xs text-ink"
            onChange={(e) => {
              const next = e.target.value as BoardGroup;
              startTransition(async () => {
                await moveProjectGroupAction(project.id, next);
                refresh();
              });
            }}
          >
            {BOARD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {BOARD_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
          {project.archived ? (
            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink-muted">
              Archived
            </span>
          ) : null}
        </div>

        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => {
            if (editTitle.trim() === project.title) return;
            startTransition(async () => {
              const res = await updateProjectAction({
                projectId: project.id,
                title: editTitle,
              });
              if (res.error) setError(res.error);
              else refresh();
            });
          }}
          className="w-full border-0 bg-transparent font-serif text-[1.85rem] tracking-tight text-ink outline-none focus:ring-0 sm:text-4xl"
        />
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          onBlur={() => {
            if ((editDesc || "") === (project.description ?? "")) return;
            startTransition(async () => {
              await updateProjectAction({
                projectId: project.id,
                description: editDesc,
              });
              refresh();
            });
          }}
          placeholder="Description"
          rows={2}
          className="w-full rounded-xl border border-ink/10 bg-cream/50 px-3 py-2 text-sm text-ink-muted outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/30"
        />

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-muted">
            Budget $
            <input
              value={editBudget}
              onChange={(e) => setEditBudget(e.target.value)}
              onBlur={() => {
                startTransition(async () => {
                  await updateProjectAction({
                    projectId: project.id,
                    budget: editBudget.trim() === "" ? null : editBudget,
                  });
                  refresh();
                });
              }}
              className="ml-2 min-h-10 w-28 rounded-xl border border-ink/10 bg-cream px-3 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            className="min-h-10 rounded-lg border border-ink/10 px-3 text-xs text-ink-muted hover:bg-cream"
            onClick={() => {
              startTransition(async () => {
                await updateProjectAction({
                  projectId: project.id,
                  archived: !project.archived,
                });
                refresh();
              });
            }}
          >
            {project.archived ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="min-h-10 rounded-lg border border-ink/10 px-3 text-xs text-red-700/80 hover:bg-red-50"
            onClick={() => {
              if (!confirm(`Delete “${project.title}”?`)) return;
              startTransition(async () => {
                await deleteProjectAction(project.id);
                window.location.href = "/tools/projects";
              });
            }}
          >
            Delete project
          </button>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <CostSummary rollup={project.rollup} />
        </div>

        <button
          type="button"
          className="text-xs font-medium text-brand"
          onClick={() =>
            setOpenComments((s) => ({
              ...s,
              [commentKey("project", project.id)]:
                !s[commentKey("project", project.id)],
            }))
          }
        >
          {openComments[commentKey("project", project.id)]
            ? "Hide project comments"
            : "Project comments"}
        </button>
        {openComments[commentKey("project", project.id)] ? (
          <CommentThread
            projectId={project.id}
            targetType="project"
            targetId={project.id}
            comments={comments}
            onChanged={refreshCommentsOnly}
          />
        ) : null}
      </header>

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      <section className="mt-10">
        <h2 className="font-serif text-xl text-ink">Sub-projects</h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await createSubProjectAction({
                projectId: project.id,
                title: subTitle,
              });
              if (res.error) setError(res.error);
              else {
                setSubTitle("");
                refresh();
              }
            });
          }}
        >
          <input
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            placeholder="Add sub-project…"
            className="min-h-11 flex-1 rounded-xl border border-ink/10 bg-cream px-3.5 text-sm text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="submit"
            disabled={pending || !subTitle.trim()}
            className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <ul className="mt-6 space-y-6">
          {project.sub_projects.map((sp, spIndex) => (
            <li
              key={sp.id}
              className="rounded-2xl border border-ink/10 bg-white/70 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <input
                    defaultValue={sp.title}
                    key={`${sp.id}-title-${sp.updated_at}`}
                    onBlur={(e) => {
                      const title = e.target.value.trim();
                      if (!title || title === sp.title) return;
                      startTransition(async () => {
                        await updateSubProjectAction({
                          projectId: project.id,
                          subProjectId: sp.id,
                          title,
                        });
                        refresh();
                      });
                    }}
                    className="w-full border-0 bg-transparent text-lg font-semibold text-ink outline-none"
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    Est {formatCents(sp.rollup.estimate_cents)} · Act{" "}
                    {formatCents(sp.rollup.actual_cents)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={sp.status}
                    disabled={pending}
                    className="min-h-9 rounded-lg border border-ink/10 bg-cream px-2 text-xs"
                    onChange={(e) => {
                      startTransition(async () => {
                        await updateSubProjectAction({
                          projectId: project.id,
                          subProjectId: sp.id,
                          status: e.target.value,
                        });
                        refresh();
                      });
                    }}
                  >
                    {WORK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending || spIndex === 0}
                    className="min-h-9 rounded-lg border border-ink/10 px-2 text-xs disabled:opacity-40"
                    onClick={() => {
                      startTransition(async () => {
                        await reorderSubProjectAction(project.id, sp.id, "up");
                        refresh();
                      });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={
                      pending || spIndex === project.sub_projects.length - 1
                    }
                    className="min-h-9 rounded-lg border border-ink/10 px-2 text-xs disabled:opacity-40"
                    onClick={() => {
                      startTransition(async () => {
                        await reorderSubProjectAction(
                          project.id,
                          sp.id,
                          "down",
                        );
                        refresh();
                      });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="min-h-9 rounded-lg border border-ink/10 px-2 text-xs text-red-700/80"
                    onClick={() => {
                      if (!confirm(`Delete sub-project “${sp.title}”?`)) return;
                      startTransition(async () => {
                        await deleteSubProjectAction(project.id, sp.id);
                        refresh();
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {sp.line_items.map((li, liIndex) => (
                  <li
                    key={li.id}
                    className="rounded-xl border border-ink/5 bg-cream/60 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <input
                        defaultValue={li.title}
                        key={`${li.id}-title-${li.updated_at}`}
                        onBlur={(e) => {
                          const title = e.target.value.trim();
                          if (!title || title === li.title) return;
                          startTransition(async () => {
                            await updateLineItemAction({
                              projectId: project.id,
                              lineItemId: li.id,
                              title,
                            });
                            refresh();
                          });
                        }}
                        className="min-w-[10rem] flex-1 border-0 bg-transparent text-sm font-medium text-ink outline-none"
                      />
                      <select
                        value={li.status}
                        className="min-h-8 rounded-md border border-ink/10 bg-white px-1.5 text-[11px]"
                        onChange={(e) => {
                          startTransition(async () => {
                            await updateLineItemAction({
                              projectId: project.id,
                              lineItemId: li.id,
                              status: e.target.value as WorkStatus,
                            });
                            refresh();
                          });
                        }}
                      >
                        {WORK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <select
                        value={li.assignee ?? ""}
                        className="min-h-8 rounded-md border border-ink/10 bg-white px-1.5 text-[11px]"
                        onChange={(e) => {
                          startTransition(async () => {
                            await updateLineItemAction({
                              projectId: project.id,
                              lineItemId: li.id,
                              assignee: e.target.value || null,
                            });
                            refresh();
                          });
                        }}
                      >
                        <option value="">Unassigned</option>
                        {ASSIGNEES.map((a) => (
                          <option key={a} value={a}>
                            {assigneeLabel(a)}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-[11px] text-ink-muted">
                        Est
                        <input
                          defaultValue={centsToInputValue(li.estimate_cents)}
                          key={`${li.id}-est-${li.updated_at}`}
                          onBlur={(e) => {
                            startTransition(async () => {
                              await updateLineItemAction({
                                projectId: project.id,
                                lineItemId: li.id,
                                estimate:
                                  e.target.value.trim() === ""
                                    ? null
                                    : e.target.value,
                              });
                              refresh();
                            });
                          }}
                          className="min-h-8 w-20 rounded-md border border-ink/10 bg-white px-1.5 text-[11px]"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-ink-muted">
                        Act
                        <input
                          defaultValue={centsToInputValue(li.actual_cents)}
                          key={`${li.id}-act-${li.updated_at}`}
                          onBlur={(e) => {
                            startTransition(async () => {
                              await updateLineItemAction({
                                projectId: project.id,
                                lineItemId: li.id,
                                actual:
                                  e.target.value.trim() === ""
                                    ? null
                                    : e.target.value,
                              });
                              refresh();
                            });
                          }}
                          className="min-h-8 w-20 rounded-md border border-ink/10 bg-white px-1.5 text-[11px]"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={pending || liIndex === 0}
                        className="min-h-8 rounded-md border border-ink/10 px-1.5 text-[11px] disabled:opacity-40"
                        onClick={() => {
                          startTransition(async () => {
                            await reorderLineItemAction(
                              project.id,
                              li.id,
                              "up",
                            );
                            refresh();
                          });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={
                          pending || liIndex === sp.line_items.length - 1
                        }
                        className="min-h-8 rounded-md border border-ink/10 px-1.5 text-[11px] disabled:opacity-40"
                        onClick={() => {
                          startTransition(async () => {
                            await reorderLineItemAction(
                              project.id,
                              li.id,
                              "down",
                            );
                            refresh();
                          });
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="min-h-8 rounded-md border border-ink/10 px-1.5 text-[11px] text-red-700/80"
                        onClick={() => {
                          startTransition(async () => {
                            await deleteLineItemAction(project.id, li.id);
                            refresh();
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-brand"
                      onClick={() =>
                        setOpenComments((s) => ({
                          ...s,
                          [commentKey("line_item", li.id)]:
                            !s[commentKey("line_item", li.id)],
                        }))
                      }
                    >
                      Comments
                    </button>
                    {openComments[commentKey("line_item", li.id)] ? (
                      <CommentThread
                        projectId={project.id}
                        targetType="line_item"
                        targetId={li.id}
                        comments={comments}
                        onChanged={refreshCommentsOnly}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>

              <AddLineItemForm
                projectId={project.id}
                subProjectId={sp.id}
                pending={pending}
                onAdded={refresh}
                onError={setError}
              />

              <button
                type="button"
                className="mt-3 text-[11px] text-brand"
                onClick={() =>
                  setOpenComments((s) => ({
                    ...s,
                    [commentKey("sub_project", sp.id)]:
                      !s[commentKey("sub_project", sp.id)],
                  }))
                }
              >
                Sub-project comments
              </button>
              {openComments[commentKey("sub_project", sp.id)] ? (
                <CommentThread
                  projectId={project.id}
                  targetType="sub_project"
                  targetId={sp.id}
                  comments={comments}
                  onChanged={refreshCommentsOnly}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AddLineItemForm({
  projectId,
  subProjectId,
  pending,
  onAdded,
  onError,
}: {
  projectId: string;
  subProjectId: string;
  pending: boolean;
  onAdded: () => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("");
  const [actual, setActual] = useState("");
  const [assignee, setAssignee] = useState("");
  const [, startTransition] = useTransition();

  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await createLineItemAction({
            projectId,
            subProjectId,
            title,
            estimate: estimate || undefined,
            actual: actual || undefined,
            assignee: assignee || null,
          });
          if (res.error) onError(res.error);
          else {
            setTitle("");
            setEstimate("");
            setActual("");
            setAssignee("");
            onAdded();
          }
        });
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Line item…"
        className="min-h-10 flex-1 rounded-xl border border-ink/10 bg-cream px-3 text-sm"
      />
      <input
        value={estimate}
        onChange={(e) => setEstimate(e.target.value)}
        placeholder="Est $"
        className="min-h-10 w-24 rounded-xl border border-ink/10 bg-cream px-3 text-sm"
      />
      <input
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        placeholder="Act $"
        className="min-h-10 w-24 rounded-xl border border-ink/10 bg-cream px-3 text-sm"
      />
      <select
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="min-h-10 rounded-xl border border-ink/10 bg-cream px-2 text-sm"
      >
        <option value="">Unassigned</option>
        {ASSIGNEES.map((a) => (
          <option key={a} value={a}>
            {assigneeLabel(a)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="min-h-10 rounded-xl bg-ink/90 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        Add item
      </button>
    </form>
  );
}
