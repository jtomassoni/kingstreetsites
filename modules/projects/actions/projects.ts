"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { isBoardGroup } from "@projects/lib/board";
import { insertComment, deleteComment } from "@projects/lib/comments";
import {
  deleteLineItem,
  insertLineItem,
  reorderLineItem,
  updateLineItem,
} from "@projects/lib/line-items";
import { parseDollarsToCents } from "@projects/lib/money";
import {
  deleteProject,
  getProjectDetail,
  insertProject,
  listProjects,
  moveProjectToGroup,
  reorderProjectInGroup,
  updateProject,
} from "@projects/lib/projects";
import {
  deleteSubProject,
  insertSubProject,
  reorderSubProject,
  updateSubProject,
} from "@projects/lib/sub-projects";
import {
  ASSIGNEES,
  WORK_STATUSES,
  type Assignee,
  type BoardGroup,
  type CommentTargetType,
  type ProjectDetail,
  type ProjectListItem,
  type WorkStatus,
} from "@projects/types";

function revalidateProjects(projectId?: string) {
  revalidatePath("/tools/projects");
  if (projectId) revalidatePath(`/tools/projects/${projectId}`);
}

function parseOptionalCents(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  return parseDollarsToCents(raw);
}

function isWorkStatus(v: string): v is WorkStatus {
  return (WORK_STATUSES as readonly string[]).includes(v);
}

function isAssignee(v: string): v is Assignee {
  return (ASSIGNEES as readonly string[]).includes(v);
}

export async function listProjectsAction(includeArchived = false): Promise<{
  projects?: ProjectListItem[];
  error?: string;
}> {
  try {
    const { householdId } = await requireHouseholdContext();
    const projects = await listProjects(householdId, { includeArchived });
    return { projects };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load projects" };
  }
}

export async function getProjectDetailAction(projectId: string): Promise<{
  project?: ProjectDetail;
  error?: string;
}> {
  try {
    const { householdId } = await requireHouseholdContext();
    const project = await getProjectDetail(householdId, projectId);
    if (!project) return { error: "Project not found" };
    return { project };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load project" };
  }
}

export async function createProjectAction(input: {
  title: string;
  description?: string;
  boardGroup?: string;
  budget?: string;
}): Promise<{ projectId?: string; error?: string }> {
  try {
    const { householdId, user } = await requireHouseholdContext();
    const title = input.title.trim();
    if (!title) return { error: "Title is required" };
    const boardGroup =
      input.boardGroup && isBoardGroup(input.boardGroup)
        ? input.boardGroup
        : "backlog";
    const budgetCents = parseOptionalCents(input.budget);
    const project = await insertProject({
      householdId,
      title,
      description: input.description?.trim() || null,
      boardGroup,
      budgetCents,
      createdBy: user.id,
    });
    revalidateProjects(project.id);
    return { projectId: project.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create project" };
  }
}

export async function updateProjectAction(input: {
  projectId: string;
  title?: string;
  description?: string | null;
  boardGroup?: string;
  archived?: boolean;
  budget?: string | null;
}): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const patch: Parameters<typeof updateProject>[2] = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) return { error: "Title is required" };
      patch.title = title;
    }
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }
    if (input.boardGroup !== undefined) {
      if (!isBoardGroup(input.boardGroup)) return { error: "Invalid board group" };
      patch.board_group = input.boardGroup;
    }
    if (input.archived !== undefined) patch.archived = input.archived;
    if (input.budget !== undefined) {
      patch.budget_cents =
        input.budget === null ? null : parseOptionalCents(input.budget);
    }

    const existing = await getProjectDetail(householdId, input.projectId);
    if (!existing) return { error: "Project not found" };

    if (
      input.boardGroup &&
      isBoardGroup(input.boardGroup) &&
      input.boardGroup !== existing.board_group
    ) {
      await moveProjectToGroup(householdId, input.projectId, input.boardGroup);
      delete patch.board_group;
    }

    if (Object.keys(patch).length) {
      const updated = await updateProject(householdId, input.projectId, patch);
      if (!updated) return { error: "Project not found" };
    }
    revalidateProjects(input.projectId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update project" };
  }
}

export async function deleteProjectAction(
  projectId: string,
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const ok = await deleteProject(householdId, projectId);
    if (!ok) return { error: "Project not found" };
    revalidateProjects();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete project" };
  }
}

export async function reorderProjectAction(
  projectId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    await reorderProjectInGroup(
      householdId,
      projectId,
      direction === "up" ? -1 : 1,
    );
    revalidateProjects(projectId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reorder" };
  }
}

export async function moveProjectGroupAction(
  projectId: string,
  boardGroup: string,
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    if (!isBoardGroup(boardGroup)) return { error: "Invalid board group" };
    const updated = await moveProjectToGroup(
      householdId,
      projectId,
      boardGroup as BoardGroup,
    );
    if (!updated) return { error: "Project not found" };
    revalidateProjects(projectId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not move project" };
  }
}

export async function createSubProjectAction(input: {
  projectId: string;
  title: string;
  description?: string;
}): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const title = input.title.trim();
    if (!title) return { error: "Title is required" };
    await insertSubProject({
      householdId,
      projectId: input.projectId,
      title,
      description: input.description?.trim() || null,
    });
    revalidateProjects(input.projectId);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not create sub-project",
    };
  }
}

export async function updateSubProjectAction(input: {
  projectId: string;
  subProjectId: string;
  title?: string;
  description?: string | null;
  status?: string;
}): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const patch: Parameters<typeof updateSubProject>[2] = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) return { error: "Title is required" };
      patch.title = title;
    }
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }
    if (input.status !== undefined) {
      if (!isWorkStatus(input.status)) return { error: "Invalid status" };
      patch.status = input.status;
    }
    const updated = await updateSubProject(
      householdId,
      input.subProjectId,
      patch,
    );
    if (!updated) return { error: "Sub-project not found" };
    revalidateProjects(input.projectId);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not update sub-project",
    };
  }
}

export async function deleteSubProjectAction(
  projectId: string,
  subProjectId: string,
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const ok = await deleteSubProject(householdId, subProjectId);
    if (!ok) return { error: "Sub-project not found" };
    revalidateProjects(projectId);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not delete sub-project",
    };
  }
}

export async function reorderSubProjectAction(
  projectId: string,
  subProjectId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    await reorderSubProject(
      householdId,
      subProjectId,
      direction === "up" ? -1 : 1,
    );
    revalidateProjects(projectId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reorder" };
  }
}

export async function createLineItemAction(input: {
  projectId: string;
  subProjectId: string;
  title: string;
  description?: string;
  estimate?: string;
  actual?: string;
  assignee?: string | null;
}): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const title = input.title.trim();
    if (!title) return { error: "Title is required" };
    let assignee: Assignee | null = null;
    if (input.assignee) {
      if (!isAssignee(input.assignee)) return { error: "Invalid assignee" };
      assignee = input.assignee;
    }
    await insertLineItem({
      householdId,
      subProjectId: input.subProjectId,
      title,
      description: input.description?.trim() || null,
      estimateCents: parseOptionalCents(input.estimate),
      actualCents: parseOptionalCents(input.actual),
      assignee,
    });
    revalidateProjects(input.projectId);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not create line item",
    };
  }
}

export async function updateLineItemAction(input: {
  projectId: string;
  lineItemId: string;
  title?: string;
  description?: string | null;
  status?: string;
  estimate?: string | null;
  actual?: string | null;
  assignee?: string | null;
}): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const patch: Parameters<typeof updateLineItem>[2] = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) return { error: "Title is required" };
      patch.title = title;
    }
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }
    if (input.status !== undefined) {
      if (!isWorkStatus(input.status)) return { error: "Invalid status" };
      patch.status = input.status;
    }
    if (input.estimate !== undefined) {
      patch.estimate_cents =
        input.estimate === null ? null : parseOptionalCents(input.estimate);
    }
    if (input.actual !== undefined) {
      patch.actual_cents =
        input.actual === null ? null : parseOptionalCents(input.actual);
    }
    if (input.assignee !== undefined) {
      if (input.assignee === null || input.assignee === "") {
        patch.assignee = null;
      } else if (isAssignee(input.assignee)) {
        patch.assignee = input.assignee;
      } else {
        return { error: "Invalid assignee" };
      }
    }
    const updated = await updateLineItem(
      householdId,
      input.lineItemId,
      patch,
    );
    if (!updated) return { error: "Line item not found" };
    revalidateProjects(input.projectId);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not update line item",
    };
  }
}

export async function deleteLineItemAction(
  projectId: string,
  lineItemId: string,
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const ok = await deleteLineItem(householdId, lineItemId);
    if (!ok) return { error: "Line item not found" };
    revalidateProjects(projectId);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not delete line item",
    };
  }
}

export async function reorderLineItemAction(
  projectId: string,
  lineItemId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    await reorderLineItem(
      householdId,
      lineItemId,
      direction === "up" ? -1 : 1,
    );
    revalidateProjects(projectId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reorder" };
  }
}

export async function addCommentAction(input: {
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
  body: string;
}): Promise<{ error?: string }> {
  try {
    const { householdId, user } = await requireHouseholdContext();
    await insertComment({
      householdId,
      targetType: input.targetType,
      targetId: input.targetId,
      body: input.body,
      authorProfileId: user.id,
    });
    revalidateProjects(input.projectId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add comment" };
  }
}

export async function deleteCommentAction(
  projectId: string,
  commentId: string,
): Promise<{ error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const ok = await deleteComment(householdId, commentId);
    if (!ok) return { error: "Comment not found" };
    revalidateProjects(projectId);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not delete comment",
    };
  }
}
