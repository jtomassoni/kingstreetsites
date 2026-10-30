import { format, parseISO } from "date-fns";
import { logHouseholdActivity } from "@meals/lib/activity/log";

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack_prep: "snack",
  other: "meal",
};

function mealTypeLabel(mealType: string) {
  return MEAL_TYPE_LABELS[mealType] ?? mealType;
}

function dayLabel(dayDate: string) {
  return format(parseISO(`${dayDate}T12:00:00`), "EEE MMM d");
}

export async function logMealActivity(input: {
  householdId: string;
  actorUserId: string | null;
  actionType: "meal_added" | "meal_removed" | "meal_updated" | "meal_duplicated";
  mealId?: string | null;
  weeklyPlanId: string;
  title: string;
  mealType: string;
  dayDate: string;
}) {
  const slot = `${dayLabel(input.dayDate)} ${mealTypeLabel(input.mealType)}`;
  const summary =
    input.actionType === "meal_added" || input.actionType === "meal_duplicated"
      ? `${input.title} on ${slot}`
      : `${input.title} from ${slot}`;

  await logHouseholdActivity({
    householdId: input.householdId,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    entityType: "planned_meal",
    entityId: input.mealId ?? null,
    parentEntityType: "weekly_plan",
    parentEntityId: input.weeklyPlanId,
    summary,
    metadata: {
      title: input.title,
      mealType: input.mealType,
      dayDate: input.dayDate,
    },
  });
}

export async function logWeekBulkActivity(input: {
  householdId: string;
  actorUserId: string | null;
  actionType: "meals_cleared" | "week_copied";
  weeklyPlanId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await logHouseholdActivity({
    householdId: input.householdId,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    entityType: "weekly_plan",
    entityId: input.weeklyPlanId,
    parentEntityType: "weekly_plan",
    parentEntityId: input.weeklyPlanId,
    summary: input.summary,
    metadata: input.metadata,
  });
}

export async function logRecipeActivity(input: {
  householdId: string;
  actorUserId: string | null;
  actionType:
    | "recipe_created"
    | "recipe_edited"
    | "recipe_deleted"
    | "recipe_restored";
  recipeId: string;
  title: string;
  versionNumber?: number;
  changeSummary?: string | null;
}) {
  const summary =
    input.actionType === "recipe_edited"
      ? input.changeSummary?.trim() || input.title
      : input.title;

  await logHouseholdActivity({
    householdId: input.householdId,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    entityType: "recipe",
    entityId: input.recipeId,
    summary,
    metadata: {
      title: input.title,
      versionNumber: input.versionNumber ?? null,
    },
  });
}
