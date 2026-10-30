import { query } from "@meals/lib/db";

export type ActivityActionType =
  | "recipe_created"
  | "recipe_edited"
  | "recipe_deleted"
  | "recipe_restored"
  | "meal_added"
  | "meals_added"
  | "meal_removed"
  | "meal_updated"
  | "meal_duplicated"
  | "meals_cleared"
  | "week_copied";

export type ActivityEntityType =
  | "recipe"
  | "recipe_version"
  | "planned_meal"
  | "weekly_plan";

export async function logHouseholdActivity(input: {
  householdId: string;
  actorUserId: string | null;
  actionType: ActivityActionType;
  entityType: ActivityEntityType;
  entityId?: string | null;
  parentEntityType?: ActivityEntityType | null;
  parentEntityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await query`
    INSERT INTO household_activity (
      household_id,
      actor_user_id,
      action_type,
      entity_type,
      entity_id,
      parent_entity_type,
      parent_entity_id,
      summary,
      metadata
    ) VALUES (
      ${input.householdId},
      ${input.actorUserId},
      ${input.actionType},
      ${input.entityType},
      ${input.entityId ?? null},
      ${input.parentEntityType ?? null},
      ${input.parentEntityId ?? null},
      ${input.summary},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;
}

export function displayActorName(profile: {
  display_name: string | null;
  email: string | null;
} | null | undefined) {
  if (!profile) return "Someone";
  const name = profile.display_name?.trim();
  if (name) return name;
  const email = profile.email?.trim();
  if (email) return email.split("@")[0] ?? email;
  return "Someone";
}
