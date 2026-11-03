import { query, queryOne } from "@meals/lib/db";
import { getLineItem } from "@projects/lib/line-items";
import { getProject } from "@projects/lib/projects";
import { getSubProject } from "@projects/lib/sub-projects";
import type {
  CommentTargetType,
  HouseProjectComment,
} from "@projects/types";

function mapComment(row: Record<string, unknown>): HouseProjectComment {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    target_type: row.target_type as CommentTargetType,
    target_id: String(row.target_id),
    body: String(row.body),
    author_profile_id: (row.author_profile_id as string | null) ?? null,
    author_display_name: (row.author_display_name as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

async function assertTarget(
  householdId: string,
  targetType: CommentTargetType,
  targetId: string,
): Promise<boolean> {
  if (targetType === "project") {
    return Boolean(await getProject(householdId, targetId));
  }
  if (targetType === "sub_project") {
    return Boolean(await getSubProject(householdId, targetId));
  }
  return Boolean(await getLineItem(householdId, targetId));
}

export async function listComments(
  householdId: string,
  targetType: CommentTargetType,
  targetId: string,
): Promise<HouseProjectComment[]> {
  const rows = await query<Record<string, unknown>>`
    SELECT
      c.*,
      COALESCE(p.display_name, split_part(COALESCE(p.email, ''), '@', 1)) AS author_display_name
    FROM house_project_comments c
    LEFT JOIN profiles p ON p.id = c.author_profile_id
    WHERE c.household_id = ${householdId}
      AND c.target_type = ${targetType}
      AND c.target_id = ${targetId}
    ORDER BY c.created_at ASC
  `;
  return rows.map(mapComment);
}

export async function listCommentsForProjectTree(
  householdId: string,
  projectId: string,
  subProjectIds: string[],
  lineItemIds: string[],
): Promise<HouseProjectComment[]> {
  const targetIds = [projectId, ...subProjectIds, ...lineItemIds];
  if (!targetIds.length) return [];

  const rows = await query<Record<string, unknown>>`
    SELECT
      c.*,
      COALESCE(p.display_name, split_part(COALESCE(p.email, ''), '@', 1)) AS author_display_name
    FROM house_project_comments c
    LEFT JOIN profiles p ON p.id = c.author_profile_id
    WHERE c.household_id = ${householdId}
      AND c.target_id = ANY(${targetIds}::uuid[])
    ORDER BY c.created_at ASC
  `;
  return rows.map(mapComment);
}

export async function insertComment(input: {
  householdId: string;
  targetType: CommentTargetType;
  targetId: string;
  body: string;
  authorProfileId: string | null;
}): Promise<HouseProjectComment> {
  if (!(await assertTarget(input.householdId, input.targetType, input.targetId))) {
    throw new Error("Comment target not found");
  }
  const body = input.body.trim();
  if (!body) throw new Error("Comment cannot be empty");

  const row = await queryOne<Record<string, unknown>>`
    INSERT INTO house_project_comments (
      household_id, target_type, target_id, body, author_profile_id
    )
    VALUES (
      ${input.householdId},
      ${input.targetType},
      ${input.targetId},
      ${body},
      ${input.authorProfileId}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Failed to add comment");

  const withAuthor = await queryOne<Record<string, unknown>>`
    SELECT
      c.*,
      COALESCE(p.display_name, split_part(COALESCE(p.email, ''), '@', 1)) AS author_display_name
    FROM house_project_comments c
    LEFT JOIN profiles p ON p.id = c.author_profile_id
    WHERE c.id = ${String(row.id)}
    LIMIT 1
  `;
  return mapComment(withAuthor ?? row);
}

export async function deleteComment(
  householdId: string,
  commentId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>`
    DELETE FROM house_project_comments
    WHERE id = ${commentId} AND household_id = ${householdId}
    RETURNING id
  `;
  return Boolean(row);
}
