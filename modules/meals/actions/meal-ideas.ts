"use server";

import { revalidatePath } from "next/cache";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { envAuthEmails } from "@meals/lib/auth/env-users";
import { authorizeGenerationRequest } from "@meals/lib/ai/authorize-generation";
import { query, queryOne } from "@meals/lib/db";
import {
  generateFullRecipe,
  generateMealIdeas,
  setMealIdeaStatus,
  type HouseholdPrefs,
} from "@meals/lib/ai/generate";
import {
  generationError,
  toGenerationErrorPayload,
  type GenerationErrorCode,
} from "@meals/lib/ai/generation-error";
import {
  generateFullRecipeInputSchema,
  generateMealIdeasInputSchema,
} from "@meals/lib/ai/idea-schemas";
import { neonGenerateStore, type MealIdeaRecord } from "@meals/lib/ai/store";
import { createGenerateContext } from "@meals/lib/ai/server-context";

function mapAuthError(err: unknown): {
  error: string;
  errorCode: GenerationErrorCode;
} {
  if (err instanceof AuthError) {
    if (err.code === "unauthenticated") {
      return toGenerationErrorPayload(generationError("unauthenticated"));
    }
    return toGenerationErrorPayload(generationError("unauthorized"));
  }
  return toGenerationErrorPayload(err);
}

async function loadHouseholdPrefs(
  householdId: string,
): Promise<HouseholdPrefs> {
  const members = await query<{ user_id: string }>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId} AND is_active = true
  `;
  const ids = members.map((m) => m.user_id);
  if (!ids.length) return { members: [] };
  const profiles = await query<{
    display_name: string | null;
    dietary_restrictions: string[];
    ingredient_dislikes: string[];
    ingredient_preferences: string[];
    favorite_cuisines: string[];
  }>`
    SELECT display_name, dietary_restrictions, ingredient_dislikes,
           ingredient_preferences, favorite_cuisines
    FROM profiles
    WHERE id = ANY(${ids}::uuid[])
  `;
  return {
    members: profiles.map((p) => ({
      displayName: p.display_name?.trim() || "Member",
      dietaryRestrictions: p.dietary_restrictions ?? [],
      dislikes: p.ingredient_dislikes ?? [],
      preferences: p.ingredient_preferences ?? [],
      favoriteCuisines: p.favorite_cuisines ?? [],
    })),
  };
}

export async function getMealIdeaBoard(weeklyPlanId: string) {
  try {
    const { householdId } = await requireHouseholdContext();
    const ideas = await neonGenerateStore.listIdeasForPlan(
      householdId,
      weeklyPlanId,
    );
    const recipes = await Promise.all(
      ideas.map(async (idea) => {
        const stored = idea.recipe_id
          ? await neonGenerateStore.getGeneratedRecipe(householdId, idea.id)
          : null;
        return { ideaId: idea.id, recipe: stored?.payload ?? null };
      }),
    );
    return {
      success: true as const,
      ideas,
      recipes: Object.fromEntries(recipes.map((r) => [r.ideaId, r.recipe])),
    };
  } catch (err) {
    return mapAuthError(err);
  }
}

export async function generateMealIdeasAction(raw: unknown) {
  try {
    const parsed = generateMealIdeasInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        error: "Check the week and try again.",
        errorCode: "unknown" as const,
      };
    }

    const { user, householdId } = await requireHouseholdContext();
    authorizeGenerationRequest({
      user,
      allowedEmails: envAuthEmails(),
    });
    const plan = await queryOne<{ id: string; week_start: string }>`
      SELECT id, week_start FROM weekly_plans
      WHERE id = ${parsed.data.weeklyPlanId} AND household_id = ${householdId}
      LIMIT 1
    `;
    if (!plan) {
      return { error: "Week not found.", errorCode: "not_found" as const };
    }

    const meals = await query<{ title: string }>`
      SELECT title FROM planned_meals WHERE weekly_plan_id = ${plan.id}
    `;
    const prefs = await loadHouseholdPrefs(householdId);

    const result = await generateMealIdeas(
      {
        weeklyPlanId: plan.id,
        weekStart: plan.week_start,
        mealCount: parsed.data.mealCount ?? 1,
        dietaryFlags: parsed.data.dietaryFlags,
        availableIngredients: parsed.data.availableIngredients,
        exclusions: parsed.data.exclusions,
        cuisines: parsed.data.cuisines,
        notes: parsed.data.notes,
        existingMeals: meals,
        householdPrefs: prefs,
        replaceIdeaId: parsed.data.replaceIdeaId,
      },
      createGenerateContext(user, householdId),
    );

    revalidatePath("/tools/meals/week");
    return {
      success: true as const,
      ideas: result.ideas,
      reused: result.reused,
    };
  } catch (err) {
    return mapAuthError(err);
  }
}

export async function setMealIdeaStatusAction(input: {
  ideaId: string;
  status: "approved" | "rejected";
}) {
  try {
    const { householdId } = await requireHouseholdContext();
    const idea = await setMealIdeaStatus(
      { store: neonGenerateStore, householdId },
      input.ideaId,
      input.status,
    );
    revalidatePath("/tools/meals/week");
    return { success: true as const, idea };
  } catch (err) {
    return mapAuthError(err);
  }
}

export async function generateFullRecipeAction(raw: unknown) {
  try {
    const parsed = generateFullRecipeInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        error: "Pick a meal idea first.",
        errorCode: "unknown" as const,
      };
    }
    const { user, householdId } = await requireHouseholdContext();
    authorizeGenerationRequest({
      user,
      allowedEmails: envAuthEmails(),
    });
    const result = await generateFullRecipe(
      {
        mealIdeaId: parsed.data.mealIdeaId,
        regenerate: parsed.data.regenerate,
      },
      createGenerateContext(user, householdId),
    );
    revalidatePath("/tools/meals/week");
    revalidatePath("/tools/meals/recipes");
    return {
      success: true as const,
      recipe: result.recipe,
      recipeId: result.recipeId,
      reused: result.reused,
    };
  } catch (err) {
    return mapAuthError(err);
  }
}

export type MealIdeaBoardIdea = MealIdeaRecord;
