"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query, queryOne } from "@meals/lib/db";
import { getAiProvider } from "@meals/lib/ai/provider";
import { isAiEnabled } from "@meals/lib/env";
import {
  computeOpenMealSlots,
  enforceMinTitleUses,
  filterAcceptedMeetingMinUses,
  proposeRepeatableNames,
  proposeDayFillNames,
  type ExistingMealTitle,
  type NameProposal,
} from "@meals/lib/week/fill-slots";
import { draftToCreateInput } from "@meals/lib/recipes/recipe-draft";
import { buildQuickIdeaRecipe } from "@meals/lib/recipes/quick-idea";
import { createRecipe, findHouseholdRecipeByTitle } from "@meals/actions/recipes";
import { addPlannedMeal } from "@meals/actions/plans";
import { generateRecipeForIdea } from "@meals/actions/ai";
import type { MealType } from "@meals/types/database";
import {
  formatHouseholdPrefsForPrompt,
  suggestedHouseholdServings,
} from "@meals/lib/meals/appetite";
import {
  computeDefaultPlacements,
  parseMealDefaults,
} from "@meals/lib/meals/defaults";

async function logAi(params: {
  householdId: string;
  userId: string;
  operationType: string;
  relatedPlanId?: string | null;
  model?: string | null;
  inputSummary: string;
  outputStatus: "success" | "error" | "validation_failed";
  tokenUsage?: unknown;
  errorDetails?: string | null;
}) {
  await requireHouseholdContext();
  await query`
    INSERT INTO ai_generations (
      household_id, requested_by, operation_type, related_plan_id,
      model, input_summary, output_status, token_usage, error_details
    ) VALUES (
      ${params.householdId},
      ${params.userId},
      ${params.operationType},
      ${params.relatedPlanId ?? null},
      ${params.model ?? null},
      ${params.inputSummary},
      ${params.outputStatus},
      ${params.tokenUsage != null ? JSON.stringify(params.tokenUsage) : null}::jsonb,
      ${params.errorDetails ?? null}
    )
  `;
}

async function loadWeekContext(weeklyPlanId: string) {
  const { householdId } = await requireHouseholdContext();
  const plan = await queryOne<Record<string, unknown>>`
    SELECT * FROM weekly_plans
    WHERE id = ${weeklyPlanId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!plan) return { error: "Plan not found" as const };

  const days = await query<{
    id: string;
    day_date: string;
    profile_type: string;
    needs_portable_snacks: boolean;
  }>`
    SELECT id, day_date, profile_type, needs_portable_snacks
    FROM plan_days
    WHERE weekly_plan_id = ${weeklyPlanId}
    ORDER BY sort_order
  `;

  const meals = await query<{
    plan_day_id: string;
    meal_type: string;
    title: string;
  }>`
    SELECT plan_day_id, meal_type, title
    FROM planned_meals
    WHERE weekly_plan_id = ${weeklyPlanId}
  `;

  const library = await query<{
    id: string;
    title: string;
    meal_types: string[] | null;
  }>`
    SELECT id, title, meal_types FROM recipes
    WHERE household_id = ${householdId} AND is_active = true
  `;

  const members = await query<{ user_id: string }>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId} AND is_active = true
  `;
  const memberIds = members.map((m) => m.user_id);
  const profiles = memberIds.length
    ? await query<{
        display_name: string | null;
        dietary_restrictions: string[];
        ingredient_dislikes: string[];
        favorite_cuisines: string[];
      }>`
        SELECT display_name, dietary_restrictions, ingredient_dislikes, favorite_cuisines
        FROM profiles
        WHERE id = ANY(${memberIds}::uuid[])
      `
    : [];

  return {
    plan,
    days,
    meals,
    library,
    profiles,
    householdId,
  };
}

function existingMealsForFill(
  meals: { title: string; meal_type: string; plan_day_id: string }[],
  days: { id: string; day_date: string }[],
  keep: NameProposal[],
): ExistingMealTitle[] {
  const dayById = new Map(days.map((d) => [d.id, d.day_date]));
  return [
    ...meals.map((m) => ({
      title: m.title,
      meal_type: m.meal_type,
      dayDate: dayById.get(m.plan_day_id),
    })),
    ...keep.map((k) => ({
      title: k.title,
      meal_type: k.mealType,
      dayDate: k.dayDate,
    })),
  ];
}

function proposeWithoutAi(
  slots: ReturnType<typeof computeOpenMealSlots>,
  library: { title: string; meal_types: string[] | null }[],
  existing: ExistingMealTitle[],
  avoidTitles: string[] = [],
): NameProposal[] {
  return proposeRepeatableNames(slots, library, existing, { avoidTitles });
}

function mapAiProposalsToSlots(
  slots: ReturnType<typeof computeOpenMealSlots>,
  aiProposals: { dayDate: string; mealType: MealType | string; title: string }[],
  fallbackTitles: string[],
): NameProposal[] {
  const byKey = new Map<string, string>(
    aiProposals.map((p) => [`${p.dayDate}:${p.mealType}`, p.title]),
  );
  let fallbackIndex = 0;

  return slots.map((slot) => ({
    key: slot.key,
    planDayId: slot.planDayId,
    dayDate: slot.dayDate,
    mealType: slot.mealType,
    title:
      byKey.get(slot.key) ??
      fallbackTitles[fallbackIndex++] ??
      "Leftover Buffet Night",
  }));
}

export async function proposeWeekMealNames(input: {
  weeklyPlanId: string;
  source?: "library" | "ai";
  /** When set, only propose for open slots on this plan day. */
  planDayId?: string;
  /** When rerolling, only replace these slot keys; keep others as provided. */
  replaceKeys?: string[];
  keep?: NameProposal[];
  /** Titles the household just rejected — don't put them back on those slots. */
  avoidTitles?: string[];
}) {
  const isReroll = Boolean(input.replaceKeys?.length);
  const isDayScope = Boolean(input.planDayId);
  const applied =
    isReroll || isDayScope
      ? ({ success: true as const, placed: [] as { title: string }[] })
      : await applyMealDefaultsToPlan(input.weeklyPlanId);
  if ("error" in applied) return { error: applied.error };

  const ctx = await loadWeekContext(input.weeklyPlanId);
  if ("error" in ctx) return { error: ctx.error };

  const { user } = await requireHouseholdContext();
  let openSlots = computeOpenMealSlots(ctx.days, ctx.meals);
  if (input.planDayId) {
    openSlots = openSlots.filter((slot) => slot.planDayId === input.planDayId);
  }
  if (!openSlots.length) {
    if (applied.placed.length) {
      return {
        success: true,
        source: "defaults" as const,
        proposals: [],
        openSlotCount: 0,
        appliedDefaults: applied.placed.length,
      };
    }
    return {
      error: isDayScope
        ? "No open meal slots on this day."
        : "No open meal slots — breakfast/lunch/dinner (and workday snacks) are already filled.",
    };
  }

  const source =
    input.source === "ai" && isAiEnabled()
      ? "ai"
      : "library";

  const keep = input.keep ?? [];
  const keepKeys = new Set(keep.map((k) => k.key));
  const replaceKeys = new Set(
    input.replaceKeys?.length
      ? input.replaceKeys
      : openSlots.map((s) => s.key).filter((k) => !keepKeys.has(k)),
  );
  const slotsToFill = openSlots.filter((s) => replaceKeys.has(s.key));

  let fresh: NameProposal[] = [];
  const existing = existingMealsForFill(ctx.meals, ctx.days, keep);
  const avoidTitles = input.avoidTitles ?? [];

  if (!slotsToFill.length) {
    return {
      success: true,
      source,
      proposals: keep.filter((k) => openSlots.some((s) => s.key === k.key)),
      openSlotCount: openSlots.length,
      appliedDefaults: applied.placed.length || undefined,
    };
  }

  if (source === "library") {
    fresh = isDayScope
      ? proposeDayFillNames(slotsToFill, ctx.library, existing, {
          avoidTitles,
        })
      : proposeWithoutAi(slotsToFill, ctx.library, existing, avoidTitles);
  } else {
    try {
      const provider = getAiProvider();
      const prompt = JSON.stringify({
        weekStart: ctx.plan.week_start,
        openSlots: slotsToFill.map((s) => ({
          dayDate: s.dayDate,
          mealType: s.mealType,
        })),
        existingMeals: ctx.meals,
        libraryTitles: ctx.library.map((r) => r.title).slice(0, 60),
        householdPrefs: formatHouseholdPrefsForPrompt(ctx.profiles),
        avoidTitles: avoidTitles.length ? avoidTitles : undefined,
        instruction:
          "Meal-prep in small batches, not a unique dish for every slot. Every distinct title you introduce must appear in at least 2 slots of the same meal type. Interleave dishes — never put the same title on consecutive calendar days. If a dish is already on the week only once, reuse it on a non-adjacent day of the same type. Odd leftover slots must extend an existing batch, never a brand-new one-off. Do not reuse avoided titles. Return JSON { proposals: [{ dayDate, mealType, title }] }.",
      });
      const result = await provider.proposeWeekNames(prompt);
      await logAi({
        householdId: ctx.householdId,
        userId: user.id,
        operationType: "propose_week_names",
        relatedPlanId: input.weeklyPlanId,
        model: result.model,
        inputSummary: `slots:${slotsToFill.length}`,
        outputStatus: "success",
        tokenUsage: result.usage,
      });
      const fallback = proposeWithoutAi(
        slotsToFill,
        ctx.library,
        existing,
        avoidTitles,
      );
      fresh = enforceMinTitleUses(
        mapAiProposalsToSlots(
          slotsToFill,
          result.data.proposals,
          fallback.map((p) => p.title),
        ),
        existing,
        { avoidTitles },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI failed";
      await logAi({
        householdId: ctx.householdId,
        userId: user.id,
        operationType: "propose_week_names",
        relatedPlanId: input.weeklyPlanId,
        inputSummary: `slots:${slotsToFill.length}`,
        outputStatus: "error",
        errorDetails: message,
      });
      fresh = proposeWithoutAi(slotsToFill, ctx.library, existing, avoidTitles);
      return {
        success: true,
        source: "library" as const,
        proposals: mergeProposals(openSlots, keep, fresh),
        openSlotCount: openSlots.length,
        appliedDefaults: applied.placed.length || undefined,
        warning: `AI unavailable (${message}); used your library instead.`,
      };
    }
  }

  const proposals = mergeProposals(openSlots, keep, fresh);
  if (!proposals.length && slotsToFill.length > 0) {
    return {
      error: isDayScope
        ? ctx.library.length
          ? "Couldn't find recipe matches for this day's open slots."
          : "Add recipes to your library before filling this day."
        : "Couldn't propose meals for the open slots.",
    };
  }

  return {
    success: true,
    source,
    proposals,
    openSlotCount: openSlots.length,
    appliedDefaults: applied.placed.length || undefined,
  };
}

function mergeProposals(
  openSlots: ReturnType<typeof computeOpenMealSlots>,
  keep: NameProposal[],
  fresh: NameProposal[],
): NameProposal[] {
  const byKey = new Map<string, NameProposal>();
  for (const p of keep) byKey.set(p.key, p);
  for (const p of fresh) byKey.set(p.key, p);
  return openSlots
    .map((slot) => byKey.get(slot.key))
    .filter((p): p is NameProposal => Boolean(p));
}

async function resolveRecipeIdForTitle(
  title: string,
  mealType: MealType = "dinner",
  opts?: { skipAi?: boolean },
): Promise<
  | { recipeId: string; via: "library" | "ai" | "quick" }
  | { error: string }
> {
  const matches = await findHouseholdRecipeByTitle(title);
  if (matches.length) {
    return { recipeId: matches[0]!.id, via: "library" };
  }

  if (!opts?.skipAi && isAiEnabled()) {
    const generated = await generateRecipeForIdea({
      mealIdea: title,
      save: true,
    });
    if (generated.error) return { error: generated.error };
    if (generated.usedHouseholdRecipe && generated.recipes?.[0]) {
      return { recipeId: generated.recipes[0].id, via: "library" };
    }
    const saved = generated.saved as { recipeId?: string; error?: string } | undefined;
    if (saved?.error) return { error: saved.error };
    if (saved?.recipeId) return { recipeId: saved.recipeId, via: "ai" };
  }

  const quick = buildQuickIdeaRecipe(title, mealType);
  const created = await createRecipe({
    ...draftToCreateInput(quick, "quick"),
    sourceType: "household",
  });
  if ("error" in created && created.error) {
    return {
      error:
        created.error ??
        `No recipe for “${title}” in the library${isAiEnabled() ? "" : " (enable AI to generate missing ones)"}.`,
    };
  }
  if (!("recipeId" in created) || !created.recipeId) {
    return { error: `Could not create a recipe for “${title}”.` };
  }
  return { recipeId: created.recipeId, via: "quick" };
}

export async function applyAcceptedWeekMeals(input: {
  weeklyPlanId: string;
  accepted: NameProposal[];
  /** When false, place each accepted slot even if the title only appears once. */
  enforceMinUses?: boolean;
}) {
  if (!input.accepted.length) {
    return { error: "Accept at least one meal idea first." };
  }

  const ctx = await loadWeekContext(input.weeklyPlanId);
  if ("error" in ctx) return { error: ctx.error };

  const openSlots = computeOpenMealSlots(ctx.days, ctx.meals);
  const openByKey = new Map(openSlots.map((s) => [s.key, s]));
  const servings = suggestedHouseholdServings();
  const enforceMinUses = input.enforceMinUses !== false;
  const existing = existingMealsForFill(ctx.meals, ctx.days, []);
  const filtered = enforceMinUses
    ? filterAcceptedMeetingMinUses(input.accepted, existing)
    : { kept: input.accepted, skipped: [] as NameProposal[] };
  const { kept: accepted, skipped: belowMin } = filtered;

  const placed: { title: string; via: string }[] = [];
  const errors: string[] = [];

  if (belowMin.length) {
    const titles = [...new Set(belowMin.map((item) => item.title))];
    errors.push(
      `${titles.join(", ")}: each new dish needs at least two slots this week (small-batch prep)`,
    );
  }

  for (const item of accepted) {
    const slot = openByKey.get(item.key);
    if (!slot) {
      errors.push(`${item.title}: slot already filled or missing`);
      continue;
    }

    const resolved = await resolveRecipeIdForTitle(item.title, slot.mealType);
    if ("error" in resolved) {
      errors.push(`${item.title}: ${resolved.error}`);
      continue;
    }

    const added = await addPlannedMeal(
      {
        planDayId: slot.planDayId,
        weeklyPlanId: input.weeklyPlanId,
        recipeId: resolved.recipeId,
        mealType: slot.mealType,
        assignedTo: "both",
        servings,
        title: item.title,
      },
      { syncGrocery: false },
    );

    if (added.error) {
      errors.push(`${item.title}: ${added.error}`);
      continue;
    }

    placed.push({ title: item.title, via: resolved.via });
    openByKey.delete(item.key);
  }

  if (placed.length) {
    const { queueGrocerySync } = await import("@meals/actions/grocery");
    queueGrocerySync(input.weeklyPlanId);
  }

  revalidatePath("/tools/meals/week");
  revalidatePath("/tools/meals/recipes");

  if (!placed.length) {
    return { error: errors[0] ?? "Could not place any meals." };
  }

  return {
    success: true,
    placed,
    errors: errors.length ? errors : undefined,
  };
}

export async function applyMealDefaultsToPlan(
  weeklyPlanId: string,
  options?: { syncGrocery?: boolean; revalidate?: boolean },
) {
  const { householdId } = await requireHouseholdContext();
  const plan = await queryOne<{ id: string }>`
    SELECT id FROM weekly_plans
    WHERE id = ${weeklyPlanId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!plan) return { error: "Plan not found" as const };

  const days = await query<{ id: string; day_date: string }>`
    SELECT id, day_date FROM plan_days
    WHERE weekly_plan_id = ${weeklyPlanId}
    ORDER BY sort_order
  `;

  const meals = await query<{
    plan_day_id: string;
    meal_type: string;
    assigned_to: string;
    assigned_to_user_id: string | null;
  }>`
    SELECT plan_day_id, meal_type, assigned_to, assigned_to_user_id
    FROM planned_meals
    WHERE weekly_plan_id = ${weeklyPlanId}
  `;

  const members = await query<{ user_id: string }>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId} AND is_active = true
  `;
  const memberIds = members.map((m) => m.user_id);
  const profiles = memberIds.length
    ? await query<{ id: string; meal_defaults: unknown }>`
        SELECT id, meal_defaults FROM profiles
        WHERE id = ANY(${memberIds}::uuid[])
      `
    : [];

  const placements = computeDefaultPlacements({
    days,
    meals,
    members: profiles.map((p) => ({
      userId: p.id,
      defaults: parseMealDefaults(p.meal_defaults),
    })),
  });

  if (!placements.length) {
    return { success: true as const, placed: [] as { title: string }[] };
  }

  const placed: { title: string }[] = [];
  const errors: string[] = [];

  for (const item of placements) {
    // Usual meals are already chosen by the user — never call OpenAI / catalog APIs.
    let recipeId = item.recipeId ?? null;
    if (recipeId) {
      const active = await queryOne<{ id: string }>`
        SELECT id FROM recipes
        WHERE id = ${recipeId}
          AND household_id = ${householdId}
          AND is_active = true
        LIMIT 1
      `;
      if (!active) {
        errors.push(`${item.title}: recipe is no longer active`);
        continue;
      }
    } else {
      const resolved = await resolveRecipeIdForTitle(item.title, item.mealType, {
        skipAi: true,
      });
      if ("error" in resolved) {
        errors.push(`${item.title}: ${resolved.error}`);
        continue;
      }
      recipeId = resolved.recipeId;
    }

    const added = await addPlannedMeal(
      {
        planDayId: item.planDayId,
        weeklyPlanId,
        recipeId,
        mealType: item.mealType,
        assignedTo: item.assignedTo,
        assignedToUserId: item.assignedToUserId,
        servings: item.servings,
        title: item.title,
        notes: `Usual ${item.mealType}`,
      },
      { syncGrocery: false, revalidate: false },
    );

    if (added.error) {
      errors.push(`${item.title}: ${added.error}`);
      continue;
    }

    placed.push({ title: item.title });
  }

  if (placed.length && options?.syncGrocery !== false) {
    const { queueGrocerySync } = await import("@meals/actions/grocery");
    queueGrocerySync(weeklyPlanId);
  }

  if (placed.length && options?.revalidate !== false) {
    revalidatePath("/tools/meals/week");
    revalidatePath("/tools/meals/recipes");
  }

  return {
    success: true as const,
    placed,
    errors: errors.length ? errors : undefined,
  };
}
