"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query, queryOne } from "@meals/lib/db";
import { classifyAiError, formatAiErrorMessage } from "@meals/lib/ai/errors";
import { getAiProvider } from "@meals/lib/ai/provider";
import { createGenerateContext } from "@meals/lib/ai/server-context";
import { generateRecipeFromSearch } from "@meals/lib/ai/generate";
import { GenerationError } from "@meals/lib/ai/generation-error";
import type { FullRecipePayload } from "@meals/lib/ai/idea-schemas";
import type { AiRecipe } from "@meals/lib/ai/schemas";
import {
  createRecipe,
  listHouseholdRecipeSummaries,
} from "@meals/actions/recipes";
import { isAiEnabled } from "@meals/lib/env";
import { matchIdeaToLibrary } from "@meals/lib/ideas/match";
import { formatHouseholdPrefsForPrompt } from "@meals/lib/meals/appetite";
import { applyRecipeFeedback } from "@meals/lib/recipes/apply-recipe-feedback";
import {
  buildParseRecipeUserPrompt,
  hasRecipeParseContext,
  type RecipeParseContext,
} from "@meals/lib/recipes/parse-recipe-request";
import { validateRecipePaste } from "@meals/lib/recipes/validate-recipe-paste";

async function logAi(params: {
  householdId: string;
  userId: string;
  operationType: string;
  relatedPlanId?: string | null;
  relatedRecipeId?: string | null;
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
      related_recipe_id, model, input_summary, output_status,
      token_usage, error_details
    ) VALUES (
      ${params.householdId},
      ${params.userId},
      ${params.operationType},
      ${params.relatedPlanId ?? null},
      ${params.relatedRecipeId ?? null},
      ${params.model ?? null},
      ${params.inputSummary},
      ${params.outputStatus},
      ${params.tokenUsage != null ? JSON.stringify(params.tokenUsage) : null}::jsonb,
      ${params.errorDetails ?? null}
    )
  `;
}

async function householdProfiles(householdId: string) {
  await requireHouseholdContext();
  const members = await query<{ user_id: string }>`
    SELECT user_id FROM household_members
    WHERE household_id = ${householdId} AND is_active = true
  `;
  const ids = members.map((m) => m.user_id);
  if (!ids.length) return [];
  return query<{
    display_name: string | null;
    dietary_restrictions: string[];
    ingredient_dislikes: string[];
    favorite_cuisines: string[];
  }>`
    SELECT display_name, dietary_restrictions, ingredient_dislikes, favorite_cuisines
    FROM profiles
    WHERE id = ANY(${ids}::uuid[])
  `;
}

export async function parseRecipeFromText(input: {
  text: string;
  relatedRecipeId?: string;
  currentRecipe?: RecipeParseContext | null;
}) {
  if (!isAiEnabled()) {
    return {
      error: "AI is not configured. Set OPENAI_API_KEY in .env.local.",
    };
  }

  const text = input.text.trim();
  const currentRecipe = hasRecipeParseContext(input.currentRecipe)
    ? input.currentRecipe
    : null;
  const pasteError = validateRecipePaste(text, {
    revising: Boolean(currentRecipe),
  });
  if (pasteError) {
    return { error: pasteError };
  }

  const { user, householdId } = await requireHouseholdContext();
  const summary = text.slice(0, 180).replace(/\s+/g, " ");

  try {
    const provider = getAiProvider();
    const result = await provider.parseRecipe(
      buildParseRecipeUserPrompt(text, currentRecipe),
    );
    await logAi({
      householdId,
      userId: user.id,
      operationType: "parse_recipe",
      relatedRecipeId: input.relatedRecipeId ?? null,
      model: result.model,
      inputSummary: summary,
      outputStatus: "success",
      tokenUsage: result.usage,
    });
    const recipe = currentRecipe
      ? applyRecipeFeedback(currentRecipe, result.data, text)
      : result.data;
    return { success: true as const, recipe, model: result.model };
  } catch (err) {
    const classified = classifyAiError(err);
    const message =
      classified.kind === "validation"
        ? "We couldn't parse that into a recipe. Include ingredients and at least one step, then try again."
        : formatAiErrorMessage(err);
    const rawMessage = err instanceof Error ? err.message : "AI failed";
    await logAi({
      householdId,
      userId: user.id,
      operationType: "parse_recipe",
      relatedRecipeId: input.relatedRecipeId ?? null,
      inputSummary: summary,
      outputStatus: rawMessage.includes("validation")
        ? "validation_failed"
        : "error",
      errorDetails: rawMessage,
    });
    return { error: message };
  }
}

function toAiRecipe(recipe: FullRecipePayload): AiRecipe {
  return {
    title: recipe.title,
    description: null,
    cuisine: null,
    mealTypes: ["dinner"],
    dietaryTags: recipe.dietaryFlags,
    defaultServings: recipe.servings,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    totalTimeMinutes: recipe.prepTimeMinutes + recipe.cookTimeMinutes,
    equipment: [],
    storageInstructions: recipe.storageNotes,
    leftoverNotes: recipe.substitutions.join("; ") || null,
    difficulty: null,
    ingredients: recipe.ingredients.map((i) => ({
      ingredientName: i.ingredientName,
      quantity: i.quantity,
      unit: i.unit,
      preparationNote: i.preparationNote,
      optional: i.optional,
    })),
    steps: recipe.instructions.map((instruction) => ({ instruction })),
  };
}

export async function generateRecipeForIdea(input: {
  mealIdea: string;
  servings?: number;
  notes?: string;
  save?: boolean;
  /** Skip the exact-title household lookup (user confirmed a new entry). */
  forceCreate?: boolean;
}) {
  if (!isAiEnabled()) {
    return { error: "AI is not configured. Set OPENAI_API_KEY in .env.local." };
  }

  const { user, householdId } = await requireHouseholdContext();

  if (!input.forceCreate) {
    const library = await listHouseholdRecipeSummaries();
    const { exact, similar } = matchIdeaToLibrary(input.mealIdea, library);
    if (exact) {
      return {
        success: true,
        usedHouseholdRecipe: true,
        recipes: [{ id: exact.id, title: exact.title }],
        message: `Found “${exact.title}” in your library.`,
      };
    }
    if (similar.length) {
      const idea = input.mealIdea.trim();
      return {
        success: true,
        similarRecipes: similar.map((row) => ({
          id: row.id,
          title: row.title,
        })),
        mealIdea: idea,
        message:
          similar.length === 1
            ? `Something similar: “${similar[0]!.title}”. Generate a new recipe for “${idea}”?`
            : `Similar recipes already in your book. Generate a new recipe for “${idea}”?`,
      };
    }
  }

  try {
    const generated = await generateRecipeFromSearch(
      input.mealIdea,
      createGenerateContext(user, householdId),
      input.notes,
    );
    const recipe = toAiRecipe(generated.recipe);
    const defaultServings = input.servings ?? recipe.defaultServings;

    if (input.save) {
      const saved = await createRecipe({
        title: recipe.title,
        description: recipe.description ?? null,
        sourceType: "ai",
        sourceName: "gpt-5.4-mini",
        cuisine: recipe.cuisine ?? null,
        mealTypes: recipe.mealTypes,
        dietaryTags: recipe.dietaryTags,
        defaultServings,
        prepTimeMinutes: recipe.prepTimeMinutes ?? null,
        cookTimeMinutes: recipe.cookTimeMinutes ?? null,
        totalTimeMinutes: recipe.totalTimeMinutes ?? null,
        equipment: recipe.equipment,
        storageInstructions: recipe.storageInstructions ?? null,
        leftoverNotes: recipe.leftoverNotes ?? null,
        difficulty: recipe.difficulty ?? null,
        ingredients: recipe.ingredients.map((i) => ({
          ingredientName: i.ingredientName,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          preparationNote: i.preparationNote ?? null,
          optional: i.optional ?? false,
        })),
        steps: recipe.steps,
      });
      revalidatePath("/tools/meals/recipes");
      return {
        success: true,
        recipe,
        saved,
        reused: generated.reused,
      };
    }

    return { success: true, recipe, reused: generated.reused };
  } catch (err) {
    if (err instanceof GenerationError) {
      const kind =
        err.code === "unfamiliar"
          ? ("unfamiliar" as const)
          : err.code === "budget"
            ? ("budget" as const)
            : err.code === "daily_limit"
              ? ("daily_limit" as const)
              : err.code === "not_configured"
                ? ("not_configured" as const)
                : err.code === "invalid_response"
                  ? ("validation" as const)
                  : ("unknown" as const);
      return { error: err.message, errorKind: kind };
    }
    const classified = classifyAiError(err);
    const message = formatAiErrorMessage(err);
    return { error: message, errorKind: classified.kind };
  }
}

function saveAiRecipePayload(
  recipe: {
    title: string;
    description?: string | null;
    cuisine?: string | null;
    mealTypes: string[];
    dietaryTags: string[];
    defaultServings: number;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    totalTimeMinutes?: number | null;
    equipment: string[];
    storageInstructions?: string | null;
    reheatingInstructions?: string | null;
    freezingSuitable?: boolean | null;
    leftoverNotes?: string | null;
    difficulty?: "easy" | "medium" | "hard" | null;
    ingredients: {
      ingredientName: string;
      quantity?: number | null;
      unit?: string | null;
      preparationNote?: string | null;
      optional?: boolean;
      groceryCategory?: string | null;
    }[];
    steps: { instruction: string }[];
  },
  model: string,
) {
  return createRecipe({
    title: recipe.title,
    description: recipe.description ?? null,
    sourceType: "ai",
    sourceName: model,
    cuisine: recipe.cuisine ?? null,
    mealTypes: recipe.mealTypes,
    dietaryTags: recipe.dietaryTags,
    defaultServings: recipe.defaultServings,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    equipment: recipe.equipment,
    storageInstructions: recipe.storageInstructions ?? null,
    reheatingInstructions: recipe.reheatingInstructions ?? null,
    freezingSuitable: recipe.freezingSuitable ?? null,
    leftoverNotes: recipe.leftoverNotes ?? null,
    difficulty: recipe.difficulty ?? null,
    ingredients: recipe.ingredients.map((i) => ({
      ingredientName: i.ingredientName,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      preparationNote: i.preparationNote ?? null,
      optional: i.optional ?? false,
      groceryCategory: i.groceryCategory ?? null,
    })),
    steps: recipe.steps,
  });
}

export async function generateRecipesBatch(input: {
  mode: "meal_type" | "cuisine";
  mealType?: "breakfast" | "lunch" | "dinner" | "snack_prep" | "other";
  cuisine?: string;
  /** Freeform vibe / constraints from the user (e.g. "something fast and easy"). */
  notes?: string;
  count?: number;
}) {
  if (!isAiEnabled()) {
    return { error: "AI is not configured. Set OPENAI_API_KEY in .env.local." };
  }

  const count = Math.min(Math.max(input.count ?? 3, 1), 5);
  const notes = (input.notes ?? "").trim().slice(0, 280);
  const { user, householdId } = await requireHouseholdContext();

  if (input.mode === "meal_type" && !input.mealType) {
    return { error: "Choose a meal type." };
  }
  if (input.mode === "cuisine" && !input.cuisine?.trim()) {
    return { error: "Enter a cuisine." };
  }

  const profiles = await householdProfiles(householdId);
  const prefsBlock = formatHouseholdPrefsForPrompt(profiles);
  const existing = await query<{ title: string }>`
    SELECT title FROM recipes
    WHERE household_id = ${householdId} AND is_active = true
    LIMIT 40
  `;

  const focus =
    input.mode === "meal_type"
      ? `meal type: ${input.mealType}`
      : `cuisine: ${input.cuisine!.trim()}`;

  const prompt = [
    `Generate exactly ${count} distinct practical home-cook recipes focused on ${focus}.`,
    input.mode === "meal_type"
      ? `Every recipe must include "${input.mealType}" in mealTypes.`
      : `Every recipe should fit ${input.cuisine!.trim()} cuisine.`,
    notes
      ? `Household request / vibe (follow closely; every recipe should clearly fit): "${notes}"`
      : null,
    `Avoid titles already in the household library: ${JSON.stringify(existing.map((r) => r.title))}`,
    `Household prefs: ${prefsBlock}`,
    "Return JSON { recipes: [{ title, description, cuisine, mealTypes, dietaryTags, defaultServings, prepTimeMinutes, cookTimeMinutes, totalTimeMinutes, equipment, storageInstructions, reheatingInstructions, freezingSuitable, leftoverNotes, difficulty, ingredients[{ingredientName,quantity,unit,preparationNote,optional,groceryCategory}], steps[{instruction}] }] }.",
  ]
    .filter(Boolean)
    .join("\n");

  const summary =
    input.mode === "meal_type"
      ? `batch:${input.mealType}x${count}${notes ? `:notes` : ""}`
      : `batch:cuisine:${input.cuisine}x${count}${notes ? `:notes` : ""}`;

  try {
    const provider = getAiProvider();
    const result = await provider.generateRecipeBatch(prompt);
    await logAi({
      householdId,
      userId: user.id,
      operationType: "generate_recipes_batch",
      model: result.model,
      inputSummary: summary,
      outputStatus: "success",
      tokenUsage: result.usage,
    });

    const saved: { id: string; title: string }[] = [];
    const errors: string[] = [];

    for (const recipe of result.data.recipes.slice(0, count)) {
      const mealTypes =
        input.mode === "meal_type" && input.mealType
          ? Array.from(new Set([...(recipe.mealTypes ?? []), input.mealType]))
          : recipe.mealTypes;
      const cuisine =
        input.mode === "cuisine" && input.cuisine?.trim()
          ? (recipe.cuisine ?? input.cuisine.trim())
          : (recipe.cuisine ?? null);

      const created = await saveAiRecipePayload(
        { ...recipe, mealTypes, cuisine },
        result.model,
      );
      if ("error" in created && created.error) {
        errors.push(`${recipe.title}: ${created.error}`);
      } else if ("recipeId" in created && created.recipeId) {
        saved.push({ id: created.recipeId, title: recipe.title });
      }
    }

    revalidatePath("/tools/meals/recipes");
    revalidatePath("/tools/meals/week");

    if (!saved.length) {
      return { error: errors[0] ?? "Failed to save generated recipes." };
    }

    return {
      success: true,
      saved,
      errors: errors.length ? errors : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI failed";
    await logAi({
      householdId,
      userId: user.id,
      operationType: "generate_recipes_batch",
      inputSummary: summary,
      outputStatus: message.includes("validation")
        ? "validation_failed"
        : "error",
      errorDetails: message,
    });
    return { error: message };
  }
}

export async function suggestMealsForWeek(input: {
  weeklyPlanId: string;
  mode: "full_week" | "open_days" | "favorites" | "low_effort";
}) {
  if (!isAiEnabled()) {
    return { error: "AI is not configured." };
  }

  const { user, householdId } = await requireHouseholdContext();

  const plan = await queryOne<{ week_start: string }>`
    SELECT * FROM weekly_plans
    WHERE id = ${input.weeklyPlanId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!plan) return { error: "Plan not found" };

  const days = await query<Record<string, unknown>>`
    SELECT * FROM plan_days WHERE weekly_plan_id = ${input.weeklyPlanId}
  `;
  const meals = await query<{
    plan_day_id: string;
    title: string;
    meal_type: string;
  }>`
    SELECT plan_day_id, title, meal_type FROM planned_meals
    WHERE weekly_plan_id = ${input.weeklyPlanId}
  `;
  const likedRows = await query<{ recipe_id: string }>`
    SELECT recipe_id FROM recipe_likes
    WHERE user_id = ${user.id} AND household_id = ${householdId}
  `;
  const likedRecipeIds = likedRows.map((row) => row.recipe_id);
  const favorites = likedRecipeIds.length
    ? await query<{ title: string; cuisine: string | null }>`
        SELECT title, cuisine FROM recipes
        WHERE household_id = ${householdId}
          AND id = ANY(${likedRecipeIds}::uuid[])
        LIMIT 20
      `
    : [];
  const historyRows = await query<{
    overall_rating: number | null;
    would_make_again: string | null;
    recipe_id: string | null;
  }>`
    SELECT overall_rating, would_make_again, recipe_id FROM meal_history
    WHERE household_id = ${householdId}
    ORDER BY cooked_at DESC
    LIMIT 30
  `;
  const historyRecipeIds = [
    ...new Set(historyRows.map((h) => h.recipe_id).filter(Boolean)),
  ] as string[];
  const historyRecipes = historyRecipeIds.length
    ? await query<{ id: string; title: string }>`
        SELECT id, title FROM recipes WHERE id = ANY(${historyRecipeIds}::uuid[])
      `
    : [];
  const historyTitleMap = new Map(historyRecipes.map((r) => [r.id, r.title]));
  const history = historyRows.map((h) => ({
    ...h,
    recipes: h.recipe_id
      ? { title: historyTitleMap.get(h.recipe_id) ?? null }
      : null,
  }));

  const prompt = JSON.stringify({
    mode: input.mode,
    weekStart: plan.week_start,
    days,
    existingMeals: meals,
    favorites,
    recentHistory: history,
    instruction:
      "Return JSON { suggestions: [{ dayDate, title, mealType, assignedTo, servings, notes, rationale }] }. Preview only — do not claim the plan was changed.",
  });

  try {
    const provider = getAiProvider();
    const result = await provider.suggestMeals(prompt);
    await logAi({
      householdId,
      userId: user.id,
      operationType: `suggest_meals_${input.mode}`,
      relatedPlanId: input.weeklyPlanId,
      model: result.model,
      inputSummary: input.mode,
      outputStatus: "success",
      tokenUsage: result.usage,
    });
    return { success: true, suggestions: result.data.suggestions };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI failed";
    await logAi({
      householdId,
      userId: user.id,
      operationType: `suggest_meals_${input.mode}`,
      relatedPlanId: input.weeklyPlanId,
      inputSummary: input.mode,
      outputStatus: "error",
      errorDetails: message,
    });
    return { error: message };
  }
}
