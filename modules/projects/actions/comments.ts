"use server";

import { requireHouseholdContext } from "@meals/lib/auth/session";
import { listCommentsForProjectTree } from "@projects/lib/comments";
import { getProjectDetail } from "@projects/lib/projects";
import type { HouseProjectComment } from "@projects/types";

export async function listCommentsAction(projectId: string): Promise<{
  comments?: HouseProjectComment[];
  error?: string;
}> {
  try {
    const { householdId } = await requireHouseholdContext();
    const detail = await getProjectDetail(householdId, projectId);
    if (!detail) return { error: "Project not found" };
    const subIds = detail.sub_projects.map((s) => s.id);
    const lineIds = detail.sub_projects.flatMap((s) =>
      s.line_items.map((li) => li.id),
    );
    const comments = await listCommentsForProjectTree(
      householdId,
      projectId,
      subIds,
      lineIds,
    );
    return { comments };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not load comments",
    };
  }
}
