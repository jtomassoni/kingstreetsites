"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { getSql, query, queryOne } from "@meals/lib/db";
import { toDateOnlyString } from "@meals/lib/dates";
import { endOfMonth, startOfMonth } from "date-fns";
import {
  addWeeks,
  formatWeekStart,
  getWeekDays,
  parseWeekStart,
} from "@meals/lib/week/dates";
import { queueGrocerySync } from "@meals/actions/grocery";
import { sittingServings, meetsMinCalendarPortions, NOT_ENOUGH_CALENDAR_PORTIONS_ERROR } from "@meals/lib/meals/appetite";
import { calendarSlotKey } from "@meals/lib/week/fill-slots";
import { revalidateWeekPlan } from "@meals/lib/week/revalidate-plan";
import { logHouseholdActivity } from "@meals/lib/activity/log";
import {
  logMealActivity,
  logWeekBulkActivity,
} from "@meals/lib/activity/events";
import {
  mealsToCopyFromPreviousWeek,
  type CopyableMeal,
} from "@meals/lib/week/copy-week";
import type {
  DayProfileType,
  MealType,
  PlanDay,
  PlannedMeal,
  WeeklyPlan,
} from "@meals/types/database";

const mealSchema = z.object({
  planDayId: z.string().uuid(),
  weeklyPlanId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack_prep", "other"]),
  assignedTo: z.enum(["both", "specific"]).default("both"),
  assignedToUserId: z.string().uuid().nullable().optional(),
  servings: z.coerce.number().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isLeftovers: z.boolean().optional(),
  leftoverFromMealId: z.string().uuid().nullable().optional(),
  recipeId: z.string().uuid(),
  recipeVersionId: z.string().uuid().nullable().optional(),
});

export async function ensureWeeklyPlan(weekStart: string) {
  const { user, householdId } = await requireHouseholdContext();
  const start = formatWeekStart(parseWeekStart(weekStart));

  const existing = await queryOne<WeeklyPlan>`
    SELECT * FROM weekly_plans
    WHERE household_id = ${householdId} AND week_start = ${start}
    LIMIT 1
  `;

  if (existing) {
    await ensurePlanDays(existing.id, householdId, start);
    return existing;
  }

  const plan = await queryOne<WeeklyPlan>`
    INSERT INTO weekly_plans (household_id, week_start, status, created_by)
    VALUES (${householdId}, ${start}, 'draft', ${user.id})
    RETURNING *
  `;

  if (!plan) {
    throw new Error("Failed to create weekly plan");
  }

  await ensurePlanDays(plan.id, householdId, start);

  const { applyMealDefaultsToPlan } = await import("@meals/actions/fill-week");
  await applyMealDefaultsToPlan(plan.id, {
    revalidate: false,
    syncGrocery: false,
  });

  return plan;
}

async function ensurePlanDays(
  weeklyPlanId: string,
  householdId: string,
  weekStart: string,
) {
  const days = getWeekDays(parseWeekStart(weekStart));

  const existingDays = await query<{ day_date: string }>`
    SELECT day_date FROM plan_days WHERE weekly_plan_id = ${weeklyPlanId}
  `;

  const have = new Set(existingDays.map((d) => toDateOnlyString(d.day_date)));
  for (let index = 0; index < days.length; index++) {
    const d = days[index]!;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dayDate = `${y}-${m}-${day}`;
    if (have.has(dayDate)) continue;
    await query`
      INSERT INTO plan_days (
        weekly_plan_id, household_id, day_date, sort_order, profile_type
      ) VALUES (
        ${weeklyPlanId}, ${householdId}, ${dayDate}, ${index}, 'normal'
      )
    `;
  }
}

export async function getWeekBundle(weekStart: string) {
  const { householdId } = await requireHouseholdContext();
  const plan = await ensureWeeklyPlan(weekStart);

  const planDays = await query<PlanDay>`
    SELECT * FROM plan_days
    WHERE weekly_plan_id = ${plan.id}
    ORDER BY sort_order
  `;

  const meals = await query<PlannedMeal>`
    SELECT * FROM planned_meals
    WHERE weekly_plan_id = ${plan.id}
    ORDER BY sort_order
  `;

  const members = await query<{ user_id: string }>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId} AND is_active = true
  `;

  const memberIds = members.map((m) => m.user_id);
  const profiles = memberIds.length
    ? await query<{
        id: string;
        display_name: string | null;
        email: string | null;
      }>`
        SELECT id, display_name, email FROM profiles
        WHERE id = ANY(${memberIds}::uuid[])
      `
    : [];

  return {
    plan: {
      ...plan,
      week_start: toDateOnlyString(plan.week_start),
    },
    planDays: planDays.map((d) => ({
      ...d,
      day_date: toDateOnlyString(d.day_date),
    })),
    meals,
    members: profiles.map((p) => ({
      user_id: p.id,
      profiles: p,
    })),
  };
}

export async function getMonthMealSummary(year: number, monthIndex: number) {
  try {
    const { householdId } = await requireHouseholdContext();
    const monthStart = startOfMonth(new Date(year, monthIndex, 1));
    const monthEnd = endOfMonth(monthStart);
    const startDate = toDateOnlyString(monthStart);
    const endDate = toDateOnlyString(monthEnd);

    const rows = await query<{ day_date: string; count: string }>`
      SELECT pd.day_date, COUNT(pm.id)::text AS count
      FROM plan_days pd
      LEFT JOIN planned_meals pm ON pm.plan_day_id = pd.id
      WHERE pd.household_id = ${householdId}
        AND pd.day_date >= ${startDate}
        AND pd.day_date <= ${endDate}
      GROUP BY pd.day_date
    `;

    const summary: Record<string, number> = {};
    for (const row of rows) {
      summary[toDateOnlyString(row.day_date)] = Number.parseInt(row.count, 10);
    }
    return summary;
  } catch (err) {
    if (err instanceof AuthError) {
      return {};
    }
    throw err;
  }
}

export async function addPlannedMeal(
  input: z.infer<typeof mealSchema>,
  options?: { syncGrocery?: boolean; revalidate?: boolean },
) {
  const parsed = mealSchema.parse(input);
  const { user, householdId } = await requireHouseholdContext();

  const recipe = await queryOne<{ id: string; title: string }>`
    SELECT id, title FROM recipes
    WHERE id = ${parsed.recipeId}
      AND household_id = ${householdId}
      AND is_active = true
    LIMIT 1
  `;

  if (!recipe) {
    return { error: "Pick a recipe from your library before adding it to the week." };
  }

  let recipeVersionId = parsed.recipeVersionId ?? null;
  if (!recipeVersionId) {
    const version = await queryOne<{ id: string }>`
      SELECT id FROM recipe_versions
      WHERE recipe_id = ${recipe.id} AND is_current = true
      LIMIT 1
    `;
    recipeVersionId = version?.id ?? null;
  }

  const maxSort = await queryOne<{ sort_order: number }>`
    SELECT sort_order FROM planned_meals
    WHERE plan_day_id = ${parsed.planDayId}
    ORDER BY sort_order DESC
    LIMIT 1
  `;

  const assignedTo = parsed.assignedTo;
  const assignedToUserId =
    assignedTo === "specific" ? (parsed.assignedToUserId ?? null) : null;

  const title =
    parsed.isLeftovers && !parsed.title?.trim()
      ? `${recipe.title} (leftovers)`
      : parsed.title?.trim() || recipe.title;

  const day = await queryOne<{ day_date: string }>`
    SELECT day_date FROM plan_days
    WHERE id = ${parsed.planDayId} AND household_id = ${householdId}
    LIMIT 1
  `;

  try {
    const inserted = await queryOne<{ id: string }>`
      INSERT INTO planned_meals (
        plan_day_id, weekly_plan_id, household_id, title, meal_type,
        assigned_to, assigned_to_user_id, servings, notes, is_leftovers,
        leftover_from_meal_id, recipe_id, recipe_version_id, sort_order, created_by
      ) VALUES (
        ${parsed.planDayId},
        ${parsed.weeklyPlanId},
        ${householdId},
        ${title},
        ${parsed.mealType as MealType},
        ${assignedTo},
        ${assignedToUserId},
        ${parsed.servings ?? sittingServings(assignedTo)},
        ${parsed.notes ?? null},
        ${parsed.isLeftovers ?? false},
        ${parsed.leftoverFromMealId ?? null},
        ${recipe.id},
        ${recipeVersionId},
        ${(maxSort?.sort_order ?? 0) + 1},
        ${user.id}
      )
      RETURNING id
    `;

    if (day) {
      await logMealActivity({
        householdId,
        actorUserId: user.id,
        actionType: "meal_added",
        mealId: inserted?.id ?? null,
        weeklyPlanId: parsed.weeklyPlanId,
        title,
        mealType: parsed.mealType,
        dayDate: toDateOnlyString(day.day_date),
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Insert failed" };
  }

  if (options?.syncGrocery !== false) {
    queueGrocerySync(parsed.weeklyPlanId);
  }

  if (options?.revalidate !== false) {
    await revalidateWeekPlan(parsed.weeklyPlanId);
  }
  return { success: true };
}

const recipeSittingSchema = z.object({
  planDayId: z.string().uuid(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack_prep", "other"]),
  assignedTo: z.enum(["both", "specific"]).default("both"),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

const recipeSittingsSchema = z.object({
  weeklyPlanId: z.string().uuid(),
  recipeId: z.string().uuid(),
  notes: z.string().max(2000).nullable().optional(),
  sittings: z.array(recipeSittingSchema).min(1).max(14),
});

async function nextSortOrder(planDayId: string) {
  const maxSort = await queryOne<{ sort_order: number }>`
    SELECT sort_order FROM planned_meals
    WHERE plan_day_id = ${planDayId}
    ORDER BY sort_order DESC
    LIMIT 1
  `;
  return (maxSort?.sort_order ?? 0) + 1;
}

/** Place a recipe on enough week slots to cover the minimum portion count. */
export async function addRecipeSittings(
  input: z.infer<typeof recipeSittingsSchema>,
  options?: { syncGrocery?: boolean },
) {
  const parsed = recipeSittingsSchema.parse(input);
  const scopes = parsed.sittings.map((sitting) => sitting.assignedTo);
  if (!meetsMinCalendarPortions(scopes)) {
    return { error: NOT_ENOUGH_CALENDAR_PORTIONS_ERROR };
  }

  const used = new Set<string>();
  for (const sitting of parsed.sittings) {
    const key = calendarSlotKey(sitting.planDayId, sitting.mealType);
    if (used.has(key)) {
      return { error: "Each sitting needs its own meal slot." };
    }
    used.add(key);
  }

  const { user, householdId } = await requireHouseholdContext();

  const recipe = await queryOne<{ id: string; title: string }>`
    SELECT id, title FROM recipes
    WHERE id = ${parsed.recipeId}
      AND household_id = ${householdId}
      AND is_active = true
    LIMIT 1
  `;
  if (!recipe) {
    return {
      error: "Pick a recipe from your library before adding it to the week.",
    };
  }

  const version = await queryOne<{ id: string }>`
    SELECT id FROM recipe_versions
    WHERE recipe_id = ${recipe.id} AND is_current = true
    LIMIT 1
  `;
  const recipeVersionId = version?.id ?? null;
  const insertedIds: string[] = [];

  try {
    for (const [index, sitting] of parsed.sittings.entries()) {
      const assignedTo = sitting.assignedTo;
      const assignedToUserId =
        assignedTo === "specific" ? (sitting.assignedToUserId ?? null) : null;
      const sort = await nextSortOrder(sitting.planDayId);
      const row = await queryOne<{ id: string }>`
        INSERT INTO planned_meals (
          plan_day_id, weekly_plan_id, household_id, title, meal_type,
          assigned_to, assigned_to_user_id, servings, notes, is_leftovers,
          leftover_from_meal_id, recipe_id, recipe_version_id, sort_order, created_by
        ) VALUES (
          ${sitting.planDayId},
          ${parsed.weeklyPlanId},
          ${householdId},
          ${recipe.title},
          ${sitting.mealType as MealType},
          ${assignedTo},
          ${assignedToUserId},
          ${sittingServings(assignedTo)},
          ${index === 0 ? (parsed.notes ?? null) : null},
          false,
          null,
          ${recipe.id},
          ${recipeVersionId},
          ${sort},
          ${user.id}
        )
        RETURNING id
      `;
      if (!row?.id) throw new Error("Insert failed");
      insertedIds.push(row.id);
    }
  } catch (e) {
    if (insertedIds.length) {
      await query`
        DELETE FROM planned_meals
        WHERE household_id = ${householdId}
          AND id = ANY(${insertedIds}::uuid[])
      `;
    }
    return { error: e instanceof Error ? e.message : "Insert failed" };
  }

  if (options?.syncGrocery !== false) {
    queueGrocerySync(parsed.weeklyPlanId);
  }

  await logHouseholdActivity({
    householdId,
    actorUserId: user.id,
    actionType: "meals_added",
    entityType: "weekly_plan",
    entityId: parsed.weeklyPlanId,
    parentEntityType: "weekly_plan",
    parentEntityId: parsed.weeklyPlanId,
    summary: `${recipe.title} to ${insertedIds.length} slot${insertedIds.length === 1 ? "" : "s"}`,
    metadata: { count: insertedIds.length, recipeId: recipe.id },
  });

  await revalidateWeekPlan(parsed.weeklyPlanId);
  return { success: true };
}

export async function updatePlannedMeal(
  mealId: string,
  patch: Partial<z.infer<typeof mealSchema>> & {
    sortOrder?: number;
    planDayId?: string;
  },
) {
  const { user, householdId } = await requireHouseholdContext();

  const existing = await queryOne<{
    weekly_plan_id: string;
    title: string;
    meal_type: string;
    day_date: string;
  }>`
    SELECT pm.weekly_plan_id, pm.title, pm.meal_type, pd.day_date
    FROM planned_meals pm
    JOIN plan_days pd ON pd.id = pm.plan_day_id
    WHERE pm.id = ${mealId} AND pm.household_id = ${householdId}
    LIMIT 1
  `;
  if (!existing) return { error: "Meal not found" };

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  const add = (col: string, value: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(value);
  };

  if (patch.title !== undefined) add("title", patch.title);
  if (patch.mealType !== undefined) add("meal_type", patch.mealType);
  if (patch.assignedTo !== undefined) {
    add("assigned_to", patch.assignedTo);
    add(
      "assigned_to_user_id",
      patch.assignedTo === "specific" ? patch.assignedToUserId ?? null : null,
    );
  }
  if (patch.servings !== undefined) add("servings", patch.servings);
  if (patch.notes !== undefined) add("notes", patch.notes);
  if (patch.isLeftovers !== undefined) add("is_leftovers", patch.isLeftovers);
  if (patch.recipeId !== undefined) add("recipe_id", patch.recipeId);
  if (patch.recipeVersionId !== undefined)
    add("recipe_version_id", patch.recipeVersionId);
  if (patch.sortOrder !== undefined) add("sort_order", patch.sortOrder);
  if (patch.planDayId !== undefined) add("plan_day_id", patch.planDayId);

  if (sets.length) {
    vals.push(mealId, householdId);
    try {
      await getSql().query(
        `UPDATE planned_meals SET ${sets.join(", ")} WHERE id = $${i++} AND household_id = $${i}`,
        vals,
      );
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Update failed" };
    }

    queueGrocerySync(existing.weekly_plan_id);
    await logMealActivity({
      householdId,
      actorUserId: user.id,
      actionType: "meal_updated",
      mealId,
      weeklyPlanId: existing.weekly_plan_id,
      title: patch.title ?? existing.title,
      mealType: patch.mealType ?? existing.meal_type,
      dayDate: toDateOnlyString(existing.day_date),
    });
    await revalidateWeekPlan(existing.weekly_plan_id);
  }

  return { success: true };
}

export async function deletePlannedMeal(mealId: string) {
  const { user, householdId } = await requireHouseholdContext();
  const existing = await queryOne<{
    weekly_plan_id: string;
    title: string;
    meal_type: string;
    day_date: string;
  }>`
    SELECT pm.weekly_plan_id, pm.title, pm.meal_type, pd.day_date
    FROM planned_meals pm
    JOIN plan_days pd ON pd.id = pm.plan_day_id
    WHERE pm.id = ${mealId} AND pm.household_id = ${householdId}
    LIMIT 1
  `;
  if (!existing) return { error: "Meal not found" };

  try {
    await query`
      DELETE FROM planned_meals
      WHERE id = ${mealId} AND household_id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed" };
  }

  queueGrocerySync(existing.weekly_plan_id);
  await logMealActivity({
    householdId,
    actorUserId: user.id,
    actionType: "meal_removed",
    mealId,
    weeklyPlanId: existing.weekly_plan_id,
    title: existing.title,
    mealType: existing.meal_type,
    dayDate: toDateOnlyString(existing.day_date),
  });
  await revalidateWeekPlan(existing.weekly_plan_id);
  return { success: true };
}

export async function duplicatePlannedMeal(mealId: string) {
  const { user, householdId } = await requireHouseholdContext();
  const meal = await queryOne<{
    plan_day_id: string;
    weekly_plan_id: string;
    meal_type: string;
    assigned_to: string;
    assigned_to_user_id: string | null;
    title: string;
    recipe_id: string | null;
    recipe_version_id: string | null;
    servings: number | null;
    notes: string | null;
    is_leftovers: boolean;
    leftover_from_meal_id: string | null;
    sort_order: number;
  }>`
    SELECT * FROM planned_meals
    WHERE id = ${mealId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!meal) return { error: "Meal not found" };

  const day = await queryOne<{ day_date: string }>`
    SELECT day_date FROM plan_days
    WHERE id = ${meal.plan_day_id} AND household_id = ${householdId}
    LIMIT 1
  `;

  try {
    const copy = await queryOne<{ id: string }>`
      INSERT INTO planned_meals (
        plan_day_id, weekly_plan_id, household_id, meal_type, assigned_to,
        assigned_to_user_id, title, recipe_id, recipe_version_id, servings,
        notes, is_leftovers, leftover_from_meal_id, sort_order, created_by
      ) VALUES (
        ${meal.plan_day_id},
        ${meal.weekly_plan_id},
        ${householdId},
        ${meal.meal_type},
        ${meal.assigned_to},
        ${meal.assigned_to_user_id},
        ${`${meal.title} (copy)`},
        ${meal.recipe_id},
        ${meal.recipe_version_id},
        ${meal.servings},
        ${meal.notes},
        ${meal.is_leftovers},
        ${meal.leftover_from_meal_id},
        ${meal.sort_order + 1},
        ${user.id}
      )
      RETURNING id
    `;

    if (day) {
      await logMealActivity({
        householdId,
        actorUserId: user.id,
        actionType: "meal_duplicated",
        mealId: copy?.id ?? null,
        weeklyPlanId: meal.weekly_plan_id,
        title: `${meal.title} (copy)`,
        mealType: meal.meal_type,
        dayDate: toDateOnlyString(day.day_date),
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Duplicate failed" };
  }

  queueGrocerySync(meal.weekly_plan_id);
  await revalidateWeekPlan(meal.weekly_plan_id);
  return { success: true };
}

const bulkMealIdsSchema = z.object({
  weeklyPlanId: z.string().uuid(),
  mealIds: z.array(z.string().uuid()).min(1).max(80),
});

async function ownedPlan(weeklyPlanId: string, householdId: string) {
  return queryOne<WeeklyPlan>`
    SELECT * FROM weekly_plans
    WHERE id = ${weeklyPlanId} AND household_id = ${householdId}
    LIMIT 1
  `;
}

export async function deletePlannedMeals(input: z.infer<typeof bulkMealIdsSchema>) {
  const parsed = bulkMealIdsSchema.parse(input);
  const { user, householdId } = await requireHouseholdContext();
  const plan = await ownedPlan(parsed.weeklyPlanId, householdId);
  if (!plan) return { error: "Plan not found" };

  try {
    const deleted = await query<{ id: string }>`
      DELETE FROM planned_meals
      WHERE household_id = ${householdId}
        AND weekly_plan_id = ${parsed.weeklyPlanId}
        AND id = ANY(${parsed.mealIds}::uuid[])
      RETURNING id
    `;
    if (!deleted.length) return { error: "No meals to remove" };
    queueGrocerySync(parsed.weeklyPlanId);
    await logWeekBulkActivity({
      householdId,
      actorUserId: user.id,
      actionType: "meals_cleared",
      weeklyPlanId: parsed.weeklyPlanId,
      summary: `${deleted.length} selected meal${deleted.length === 1 ? "" : "s"}`,
      metadata: { count: deleted.length },
    });
    await revalidateWeekPlan(parsed.weeklyPlanId);
    return { success: true, deleted: deleted.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed" };
  }
}

export async function assignPlannedMeals(input: {
  weeklyPlanId: string;
  mealIds: string[];
  assignedTo: "both" | "specific";
  assignedToUserId?: string | null;
}) {
  const parsed = bulkMealIdsSchema
    .extend({
      assignedTo: z.enum(["both", "specific"]),
      assignedToUserId: z.string().uuid().nullable().optional(),
    })
    .parse(input);
  if (parsed.assignedTo === "specific" && !parsed.assignedToUserId) {
    return { error: "Pick who this meal is for" };
  }

  const { householdId } = await requireHouseholdContext();
  const plan = await ownedPlan(parsed.weeklyPlanId, householdId);
  if (!plan) return { error: "Plan not found" };

  const assignedToUserId =
    parsed.assignedTo === "specific" ? parsed.assignedToUserId ?? null : null;
  const servings = sittingServings(parsed.assignedTo);

  try {
    const updated = await query<{ id: string }>`
      UPDATE planned_meals SET
        assigned_to = ${parsed.assignedTo},
        assigned_to_user_id = ${assignedToUserId},
        servings = ${servings}
      WHERE household_id = ${householdId}
        AND weekly_plan_id = ${parsed.weeklyPlanId}
        AND id = ANY(${parsed.mealIds}::uuid[])
      RETURNING id
    `;
    if (!updated.length) return { error: "No meals to update" };
    queueGrocerySync(parsed.weeklyPlanId);
    revalidatePath("/tools/meals/week");
    return { success: true, updated: updated.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function clearPlanMeals(input: {
  weeklyPlanId: string;
  mealType?: MealType;
}) {
  const parsed = z
    .object({
      weeklyPlanId: z.string().uuid(),
      mealType: z
        .enum(["breakfast", "lunch", "dinner", "snack_prep", "other"])
        .optional(),
    })
    .parse(input);
  const { user, householdId } = await requireHouseholdContext();
  const plan = await ownedPlan(parsed.weeklyPlanId, householdId);
  if (!plan) return { error: "Plan not found" };

  try {
    const deleted = parsed.mealType
      ? await query<{ id: string }>`
          DELETE FROM planned_meals
          WHERE household_id = ${householdId}
            AND weekly_plan_id = ${parsed.weeklyPlanId}
            AND meal_type = ${parsed.mealType}
          RETURNING id
        `
      : await query<{ id: string }>`
          DELETE FROM planned_meals
          WHERE household_id = ${householdId}
            AND weekly_plan_id = ${parsed.weeklyPlanId}
          RETURNING id
        `;
    if (!deleted.length) return { error: "Nothing to clear" };
    queueGrocerySync(parsed.weeklyPlanId);
    const scope = parsed.mealType ? `${parsed.mealType} meals` : "the week";
    await logWeekBulkActivity({
      householdId,
      actorUserId: user.id,
      actionType: "meals_cleared",
      weeklyPlanId: parsed.weeklyPlanId,
      summary: `${deleted.length} meal${deleted.length === 1 ? "" : "s"} from ${scope}`,
      metadata: { count: deleted.length, mealType: parsed.mealType ?? null },
    });
    await revalidateWeekPlan(parsed.weeklyPlanId);
    return { success: true, deleted: deleted.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Clear failed" };
  }
}

export async function copyPreviousWeekMeals(weeklyPlanId: string) {
  const parsedId = z.string().uuid().parse(weeklyPlanId);
  const { user, householdId } = await requireHouseholdContext();
  const plan = await ownedPlan(parsedId, householdId);
  if (!plan) return { error: "Plan not found" };

  const weekStart = toDateOnlyString(plan.week_start);
  const previousStart = formatWeekStart(
    addWeeks(parseWeekStart(weekStart), -1),
  );

  const previousPlan = await queryOne<WeeklyPlan>`
    SELECT * FROM weekly_plans
    WHERE household_id = ${householdId} AND week_start = ${previousStart}
    LIMIT 1
  `;
  if (!previousPlan) {
    return { error: "Last week has no meals to copy." };
  }

  const [sourceDays, sourceMeals, targetDays, occupied] = await Promise.all([
    query<CopyableDayRow>`
      SELECT id, sort_order FROM plan_days
      WHERE weekly_plan_id = ${previousPlan.id}
      ORDER BY sort_order
    `,
    query<CopyableMeal>`
      SELECT
        id, plan_day_id, meal_type, assigned_to, assigned_to_user_id, title,
        recipe_id, recipe_version_id, servings, notes, is_leftovers,
        leftover_from_meal_id, sort_order
      FROM planned_meals
      WHERE weekly_plan_id = ${previousPlan.id}
      ORDER BY sort_order
    `,
    query<CopyableDayRow>`
      SELECT id, sort_order FROM plan_days
      WHERE weekly_plan_id = ${plan.id}
      ORDER BY sort_order
    `,
    query<OccupiedSlotRow>`
      SELECT plan_day_id, meal_type FROM planned_meals
      WHERE weekly_plan_id = ${plan.id}
    `,
  ]);

  const drafts = mealsToCopyFromPreviousWeek({
    sourceDays,
    sourceMeals,
    targetDays,
    occupied,
  });
  if (!drafts.length) {
    return {
      error: sourceMeals.length
        ? "Every matching slot already has a meal."
        : "Last week has no meals to copy.",
    };
  }

  const idBySource = new Map<string, string>();
  for (const draft of drafts) {
    idBySource.set(draft.sourceId, crypto.randomUUID());
  }

  const insertedIds: string[] = [];
  const nextSort = new Map<string, number>();

  try {
    for (const draft of drafts) {
      const newId = idBySource.get(draft.sourceId);
      if (!newId) continue;
      let sort = nextSort.get(draft.plan_day_id);
      if (sort == null) sort = await nextSortOrder(draft.plan_day_id);
      else sort += 1;
      nextSort.set(draft.plan_day_id, sort);

      const row = await queryOne<{ id: string }>`
        INSERT INTO planned_meals (
          id, plan_day_id, weekly_plan_id, household_id, meal_type, assigned_to,
          assigned_to_user_id, title, recipe_id, recipe_version_id, servings,
          notes, is_leftovers, leftover_from_meal_id, sort_order, created_by
        ) VALUES (
          ${newId},
          ${draft.plan_day_id},
          ${plan.id},
          ${householdId},
          ${draft.meal_type as MealType},
          ${draft.assigned_to},
          ${draft.assigned_to_user_id},
          ${draft.title},
          ${draft.recipe_id},
          ${draft.recipe_version_id},
          ${draft.servings},
          ${draft.notes},
          ${draft.is_leftovers},
          ${null},
          ${sort},
          ${user.id}
        )
        RETURNING id
      `;
      if (!row?.id) throw new Error("Insert failed");
      insertedIds.push(row.id);
    }

    for (const draft of drafts) {
      const newId = idBySource.get(draft.sourceId);
      const leftoverFrom = draft.leftover_from_meal_id
        ? (idBySource.get(draft.leftover_from_meal_id) ?? null)
        : null;
      if (!newId || !leftoverFrom) continue;
      await query`
        UPDATE planned_meals
        SET leftover_from_meal_id = ${leftoverFrom}
        WHERE id = ${newId} AND household_id = ${householdId}
      `;
    }
  } catch (e) {
    if (insertedIds.length) {
      await query`
        DELETE FROM planned_meals
        WHERE household_id = ${householdId}
          AND id = ANY(${insertedIds}::uuid[])
      `;
    }
    return { error: e instanceof Error ? e.message : "Copy failed" };
  }

  queueGrocerySync(plan.id);
  await logWeekBulkActivity({
    householdId,
    actorUserId: user.id,
    actionType: "week_copied",
    weeklyPlanId: plan.id,
    summary: `${insertedIds.length} meal${insertedIds.length === 1 ? "" : "s"} from last week`,
    metadata: { count: insertedIds.length, sourceWeekStart: previousStart },
  });
  await revalidateWeekPlan(plan.id);
  return { success: true, copied: insertedIds.length };
}

type CopyableDayRow = { id: string; sort_order: number };
type OccupiedSlotRow = { plan_day_id: string; meal_type: string };

export async function updatePlanDay(
  planDayId: string,
  input: {
    profileType?: DayProfileType;
    appliesTo?: "both" | "specific";
    appliesToUserId?: string | null;
    maxActiveCookMinutes?: number | null;
    maxTotalCookMinutes?: number | null;
    needsMealPrep?: boolean;
    needsPortableSnacks?: boolean;
    reheatOnly?: boolean;
    notes?: string | null;
  },
) {
  const { householdId } = await requireHouseholdContext();
  const day = await queryOne<{ weekly_plan_id: string }>`
    SELECT weekly_plan_id FROM plan_days
    WHERE id = ${planDayId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!day) return { error: "Day not found" };

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, value: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(value);
  };

  if (input.profileType !== undefined) add("profile_type", input.profileType);
  if (input.appliesTo !== undefined) {
    add("applies_to", input.appliesTo);
    add(
      "applies_to_user_id",
      input.appliesTo === "specific" ? input.appliesToUserId ?? null : null,
    );
  }
  if (input.maxActiveCookMinutes !== undefined)
    add("max_active_cook_minutes", input.maxActiveCookMinutes);
  if (input.maxTotalCookMinutes !== undefined)
    add("max_total_cook_minutes", input.maxTotalCookMinutes);
  if (input.needsMealPrep !== undefined)
    add("needs_meal_prep", input.needsMealPrep);
  if (input.needsPortableSnacks !== undefined)
    add("needs_portable_snacks", input.needsPortableSnacks);
  if (input.reheatOnly !== undefined) add("reheat_only", input.reheatOnly);
  if (input.notes !== undefined) add("notes", input.notes);

  if (sets.length) {
    vals.push(planDayId, householdId);
    try {
      await getSql().query(
        `UPDATE plan_days SET ${sets.join(", ")} WHERE id = $${i++} AND household_id = $${i}`,
        vals,
      );
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Update failed" };
    }
  }

  queueGrocerySync(day.weekly_plan_id);
  revalidatePath("/tools/meals/week");
  return { success: true };
}

/** Mark a household member as at work and apply their working-day meal mods. */
export async function setMemberWorkingDay(input: {
  planDayId: string;
  weeklyPlanId: string;
  userId: string;
  working: boolean;
}) {
  const { householdId } = await requireHouseholdContext();
  const { planDayId, weeklyPlanId, userId, working } = input;

  const day = await queryOne<{ working_user_ids: string[] | null }>`
    SELECT * FROM plan_days
    WHERE id = ${planDayId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!day) return { error: "Day not found" };

  const memberProfile = await queryOne<{ id: string }>`
    SELECT id FROM profiles WHERE id = ${userId} LIMIT 1
  `;
  if (!memberProfile) return { error: "Member not found" };

  const currentWorking = new Set(day.working_user_ids ?? []);
  if (working) currentWorking.add(userId);
  else currentWorking.delete(userId);
  const workingUserIds = [...currentWorking];

  // Every day is B/L/D by default; workdays also get a snack slot in the UI / fill-week.
  const needsPortableSnacks = workingUserIds.length > 0;

  try {
    await query`
      UPDATE plan_days SET
        working_user_ids = ${workingUserIds}::uuid[],
        profile_type = ${workingUserIds.length ? "workday" : "normal"},
        needs_portable_snacks = ${needsPortableSnacks},
        needs_meal_prep = false,
        reheat_only = false,
        applies_to = 'both',
        applies_to_user_id = null
      WHERE id = ${planDayId} AND household_id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }

  queueGrocerySync(weeklyPlanId);
  revalidatePath("/tools/meals/week");
  return { success: true };
}
