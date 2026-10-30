"use server";

import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query } from "@meals/lib/db";
import { displayActorName } from "@meals/lib/activity/log";

export type ActivityLogEntry = {
  id: string;
  actionType: string;
  summary: string;
  createdAt: string;
  actorName: string;
  metadata: Record<string, unknown>;
};

type ActivityRow = {
  id: string;
  action_type: string;
  summary: string;
  created_at: string | Date;
  metadata: Record<string, unknown> | null;
  display_name: string | null;
  email: string | null;
};

function mapActivityRow(row: ActivityRow): ActivityLogEntry {
  return {
    id: row.id,
    actionType: row.action_type,
    summary: row.summary,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    actorName: displayActorName({
      display_name: row.display_name,
      email: row.email,
    }),
    metadata: row.metadata ?? {},
  };
}

export async function listRecipeActivity(
  recipeId: string,
  limit = 30,
): Promise<ActivityLogEntry[]> {
  const { householdId } = await requireHouseholdContext();

  const versionRows = await query<{
    id: string;
    version_number: number;
    change_summary: string | null;
    created_at: string | Date;
    display_name: string | null;
    email: string | null;
    created_by: string | null;
  }>`
    SELECT
      rv.id,
      rv.version_number,
      rv.change_summary,
      rv.created_at,
      rv.created_by,
      p.display_name,
      p.email
    FROM recipe_versions rv
    LEFT JOIN profiles p ON p.id = rv.created_by
    WHERE rv.recipe_id = ${recipeId}
      AND rv.household_id = ${householdId}
    ORDER BY rv.version_number DESC
    LIMIT ${limit}
  `;

  const activityRows = await query<ActivityRow>`
    SELECT
      a.id,
      a.action_type,
      a.summary,
      a.created_at,
      a.metadata,
      p.display_name,
      p.email
    FROM household_activity a
    LEFT JOIN profiles p ON p.id = a.actor_user_id
    WHERE a.household_id = ${householdId}
      AND a.entity_type = 'recipe'
      AND a.entity_id = ${recipeId}
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;

  const versionEntries: ActivityLogEntry[] = versionRows.map((row) => ({
    id: `version-${row.id}`,
    actionType: row.version_number === 1 ? "recipe_created" : "recipe_edited",
    summary:
      row.version_number === 1
        ? "Created recipe"
        : row.change_summary?.trim() || `Saved version ${row.version_number}`,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    actorName: displayActorName({
      display_name: row.display_name,
      email: row.email,
    }),
    metadata: { versionNumber: row.version_number },
  }));

  const logged = activityRows.map(mapActivityRow);

  const seenVersionNumbers = new Set(
    logged
      .map((entry) => entry.metadata.versionNumber)
      .filter((value): value is number => typeof value === "number"),
  );

  const merged = [
    ...logged,
    ...versionEntries.filter(
      (entry) =>
        typeof entry.metadata.versionNumber !== "number" ||
        !seenVersionNumbers.has(entry.metadata.versionNumber),
    ),
  ];

  merged.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return merged.slice(0, limit);
}

export async function listWeekPlanActivity(
  weeklyPlanId: string,
  limit = 40,
): Promise<ActivityLogEntry[]> {
  const { householdId } = await requireHouseholdContext();

  const rows = await query<ActivityRow>`
    SELECT
      a.id,
      a.action_type,
      a.summary,
      a.created_at,
      a.metadata,
      p.display_name,
      p.email
    FROM household_activity a
    LEFT JOIN profiles p ON p.id = a.actor_user_id
    WHERE a.household_id = ${householdId}
      AND (
        (a.parent_entity_type = 'weekly_plan' AND a.parent_entity_id = ${weeklyPlanId})
        OR (a.entity_type = 'weekly_plan' AND a.entity_id = ${weeklyPlanId})
      )
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapActivityRow);
}
