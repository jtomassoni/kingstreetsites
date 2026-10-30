"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query, queryOne } from "@meals/lib/db";
import type { RecipeSourceType } from "@meals/types/database";
import {
  inferGrocerySection,
  normalizeGrocerySection,
} from "@meals/lib/grocery/sections";
import { logRecipeActivity } from "@meals/lib/activity/events";
import {
  mealDefaultsIncludeRecipe,
  omitRecipeFromMealDefaults,
  parseMealDefaults,
} from "@meals/lib/meals/defaults";

const ingredientSchema = z.object({
  rawText: z.string().optional(),
  ingredientName: z.string().min(1),
  quantity: z.coerce.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  preparationNote: z.string().nullable().optional(),
  optional: z.boolean().optional(),
  groceryCategory: z.string().nullable().optional(),
  preferredStore: z
    .enum(["king_soopers", "whole_foods", "costco", "any"])
    .nullable()
    .optional(),
  costcoBulkCandidate: z.boolean().optional(),
});

const stepSchema = z.object({
  instruction: z.string().min(1),
});

const recipeInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  sourceType: z.enum([
    "household",
    "family",
    "ai",
    "imported",
    "transcribed",
  ]),
  sourceName: z.string().nullable().optional(),
  cuisine: z.string().nullable().optional(),
  mealTypes: z.array(z.string()).optional(),
  dietaryTags: z.array(z.string()).optional(),
  defaultServings: z.coerce.number().positive().optional(),
  prepTimeMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  cookTimeMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  totalTimeMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  equipment: z.array(z.string()).optional(),
  storageInstructions: z.string().nullable().optional(),
  reheatingInstructions: z.string().nullable().optional(),
  freezingSuitable: z.boolean().nullable().optional(),
  leftoverNotes: z.string().nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  changeSummary: z.string().nullable().optional(),
  ingredients: z.array(ingredientSchema).default([]),
  steps: z.array(stepSchema).default([]),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;

export type RecipeListItem = import("@meals/types/database").Recipe & {
  liked_by_me: boolean;
  default_servings: number | null;
  total_time_minutes: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  difficulty: import("@meals/types/database").Difficulty | null;
  ingredient_count: number;
};

type RecipeListRow = import("@meals/types/database").Recipe & {
  default_servings: number | null;
  total_time_minutes: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  difficulty: import("@meals/types/database").Difficulty | null;
  ingredient_count: number | string | null;
};

export async function listRecipes(
  search?: string,
  options?: { likedOnly?: boolean },
): Promise<RecipeListItem[]> {
  const { user, householdId } = await requireHouseholdContext();
  const q = search?.trim();
  const likedOnly = options?.likedOnly === true;

  const data = q
    ? await query<RecipeListRow>`
        SELECT
          r.*,
          v.default_servings,
          v.total_time_minutes,
          v.prep_time_minutes,
          v.cook_time_minutes,
          v.difficulty,
          (
            SELECT COUNT(*)::int
            FROM recipe_ingredients ri
            WHERE ri.recipe_version_id = v.id
          ) AS ingredient_count
        FROM recipes r
        LEFT JOIN recipe_versions v
          ON v.recipe_id = r.id AND v.is_current = true
        WHERE r.household_id = ${householdId}
          AND r.is_active = true
          AND r.title ILIKE ${`%${q}%`}
        ORDER BY r.title
      `
    : await query<RecipeListRow>`
        SELECT
          r.*,
          v.default_servings,
          v.total_time_minutes,
          v.prep_time_minutes,
          v.cook_time_minutes,
          v.difficulty,
          (
            SELECT COUNT(*)::int
            FROM recipe_ingredients ri
            WHERE ri.recipe_version_id = v.id
          ) AS ingredient_count
        FROM recipes r
        LEFT JOIN recipe_versions v
          ON v.recipe_id = r.id AND v.is_current = true
        WHERE r.household_id = ${householdId} AND r.is_active = true
        ORDER BY r.title
      `;

  const likedIds = await loadLikedRecipeIds(user.id, householdId);
  const recipes = data.map((recipe) => ({
    ...recipe,
    ingredient_count: Number(recipe.ingredient_count ?? 0),
    liked_by_me: likedIds.has(recipe.id),
  }));
  return likedOnly ? recipes.filter((recipe) => recipe.liked_by_me) : recipes;
}

export async function findHouseholdRecipeByTitle(title: string) {
  const { householdId } = await requireHouseholdContext();
  return query<import("@meals/types/database").Recipe>`
    SELECT * FROM recipes
    WHERE household_id = ${householdId}
      AND is_active = true
      AND title ILIKE ${title.trim()}
    LIMIT 5
  `;
}

export type HouseholdRecipeSummary = {
  id: string;
  title: string;
  meal_types: string[] | null;
  source_type: string;
  created_at: string;
};

export async function listHouseholdRecipeSummaries(): Promise<
  HouseholdRecipeSummary[]
> {
  const { householdId } = await requireHouseholdContext();
  return query<HouseholdRecipeSummary>`
    SELECT id, title, meal_types, source_type, created_at
    FROM recipes
    WHERE household_id = ${householdId} AND is_active = true
    ORDER BY title
  `;
}

export async function getRecipeDetail(recipeId: string) {
  const { user, householdId } = await requireHouseholdContext();
  const recipe = await queryOne<import("@meals/types/database").Recipe>`
    SELECT * FROM recipes
    WHERE id = ${recipeId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!recipe) return null;

  const versions = await query<import("@meals/types/database").RecipeVersion>`
    SELECT * FROM recipe_versions
    WHERE recipe_id = ${recipeId}
    ORDER BY version_number DESC
  `;

  const current = versions.find((v) => v.is_current) ?? versions[0];
  let ingredients: import("@meals/types/database").RecipeIngredient[] = [];
  let steps: import("@meals/types/database").RecipeStep[] = [];

  if (current) {
    ingredients = await query<import("@meals/types/database").RecipeIngredient>`
      SELECT * FROM recipe_ingredients
      WHERE recipe_version_id = ${current.id}
      ORDER BY sort_order
    `;
    steps = await query<import("@meals/types/database").RecipeStep>`
      SELECT * FROM recipe_steps
      WHERE recipe_version_id = ${current.id}
      ORDER BY step_number
    `;
  }

  const like = await queryOne<{ id: string }>`
    SELECT id FROM recipe_likes
    WHERE recipe_id = ${recipeId} AND user_id = ${user.id}
    LIMIT 1
  `;

  return {
    recipe: { ...recipe, liked_by_me: Boolean(like) },
    versions,
    current,
    ingredients,
    steps,
  };
}

async function loadLikedRecipeIds(userId: string, householdId: string) {
  const data = await query<{ recipe_id: string }>`
    SELECT recipe_id FROM recipe_likes
    WHERE user_id = ${userId} AND household_id = ${householdId}
  `;
  return new Set(data.map((row) => row.recipe_id));
}

async function insertVersionContent(
  householdId: string,
  versionId: string,
  input: RecipeInput,
) {
  for (let index = 0; index < input.ingredients.length; index++) {
    const ing = input.ingredients[index]!;
    await query`
      INSERT INTO recipe_ingredients (
        recipe_version_id, household_id, raw_text, ingredient_name,
        quantity, unit, preparation_note, optional, grocery_category,
        preferred_store, costco_bulk_candidate, sort_order
      ) VALUES (
        ${versionId},
        ${householdId},
        ${
          ing.rawText ??
          [ing.quantity, ing.unit, ing.ingredientName]
            .filter(Boolean)
            .join(" ")
        },
        ${ing.ingredientName},
        ${ing.quantity ?? null},
        ${ing.unit ?? null},
        ${ing.preparationNote ?? null},
        ${ing.optional ?? false},
        ${
          normalizeGrocerySection(ing.groceryCategory) ??
          inferGrocerySection(ing.ingredientName)
        },
        ${ing.preferredStore ?? null},
        ${ing.costcoBulkCandidate ?? false},
        ${index}
      )
    `;
  }

  for (let index = 0; index < input.steps.length; index++) {
    const step = input.steps[index]!;
    await query`
      INSERT INTO recipe_steps (
        recipe_version_id, household_id, step_number, instruction
      ) VALUES (
        ${versionId}, ${householdId}, ${index + 1}, ${step.instruction}
      )
    `;
  }
}

export async function createRecipe(raw: RecipeInput) {
  const input = recipeInputSchema.parse(raw);
  const { user, householdId } = await requireHouseholdContext();

  const recipe = await queryOne<{ id: string }>`
    INSERT INTO recipes (
      household_id, title, description, source_type, source_name,
      cuisine, meal_types, dietary_tags, created_by
    ) VALUES (
      ${householdId},
      ${input.title},
      ${input.description ?? null},
      ${input.sourceType as RecipeSourceType},
      ${input.sourceName ?? null},
      ${input.cuisine ?? null},
      ${input.mealTypes ?? []},
      ${input.dietaryTags ?? []},
      ${user.id}
    )
    RETURNING id
  `;

  if (!recipe) return { error: "Create failed" };

  const version = await queryOne<{ id: string }>`
    INSERT INTO recipe_versions (
      recipe_id, household_id, version_number, is_current, change_summary,
      default_servings, prep_time_minutes, cook_time_minutes, total_time_minutes,
      equipment, storage_instructions, reheating_instructions, freezing_suitable,
      leftover_notes, difficulty, created_by
    ) VALUES (
      ${recipe.id},
      ${householdId},
      1,
      true,
      ${input.changeSummary ?? "Initial version"},
      ${input.defaultServings ?? 1},
      ${input.prepTimeMinutes ?? null},
      ${input.cookTimeMinutes ?? null},
      ${input.totalTimeMinutes ?? null},
      ${input.equipment ?? []},
      ${input.storageInstructions ?? null},
      ${input.reheatingInstructions ?? null},
      ${input.freezingSuitable ?? null},
      ${input.leftoverNotes ?? null},
      ${input.difficulty ?? null},
      ${user.id}
    )
    RETURNING id
  `;

  if (!version) return { error: "Version failed" };

  await insertVersionContent(householdId, version.id, input);
  await logRecipeActivity({
    householdId,
    actorUserId: user.id,
    actionType: "recipe_created",
    recipeId: recipe.id,
    title: input.title,
    versionNumber: 1,
    changeSummary: input.changeSummary ?? "Initial version",
  });
  revalidatePath("/tools/meals/recipes");
  return { success: true, recipeId: recipe.id };
}

export async function updateRecipeAsNewVersion(
  recipeId: string,
  raw: RecipeInput,
) {
  const input = recipeInputSchema.parse(raw);
  const { user, householdId } = await requireHouseholdContext();

  const recipe = await queryOne<{ id: string }>`
    SELECT id FROM recipes
    WHERE id = ${recipeId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!recipe) return { error: "Recipe not found" };

  const latest = await queryOne<{ version_number: number }>`
    SELECT version_number FROM recipe_versions
    WHERE recipe_id = ${recipeId}
    ORDER BY version_number DESC
    LIMIT 1
  `;

  await query`
    UPDATE recipe_versions
    SET is_current = false
    WHERE recipe_id = ${recipeId} AND is_current = true
  `;

  const nextVersion = (latest?.version_number ?? 0) + 1;

  const version = await queryOne<{ id: string }>`
    INSERT INTO recipe_versions (
      recipe_id, household_id, version_number, is_current, change_summary,
      default_servings, prep_time_minutes, cook_time_minutes, total_time_minutes,
      equipment, storage_instructions, reheating_instructions, freezing_suitable,
      leftover_notes, difficulty, created_by
    ) VALUES (
      ${recipeId},
      ${householdId},
      ${nextVersion},
      true,
      ${input.changeSummary ?? `Version ${nextVersion}`},
      ${input.defaultServings ?? 1},
      ${input.prepTimeMinutes ?? null},
      ${input.cookTimeMinutes ?? null},
      ${input.totalTimeMinutes ?? null},
      ${input.equipment ?? []},
      ${input.storageInstructions ?? null},
      ${input.reheatingInstructions ?? null},
      ${input.freezingSuitable ?? null},
      ${input.leftoverNotes ?? null},
      ${input.difficulty ?? null},
      ${user.id}
    )
    RETURNING id
  `;

  if (!version) return { error: "Version failed" };

  await query`
    UPDATE recipes SET
      title = ${input.title},
      description = ${input.description ?? null},
      source_type = ${input.sourceType as RecipeSourceType},
      source_name = ${input.sourceName ?? null},
      cuisine = ${input.cuisine ?? null},
      meal_types = ${input.mealTypes ?? []},
      dietary_tags = ${input.dietaryTags ?? []}
    WHERE id = ${recipeId}
  `;

  await insertVersionContent(householdId, version.id, input);

  const plannedMeals = await query<{
    id: string;
    title: string;
    is_leftovers: boolean;
    weekly_plan_id: string;
  }>`
    SELECT id, title, is_leftovers, weekly_plan_id FROM planned_meals
    WHERE recipe_id = ${recipeId} AND household_id = ${householdId}
  `;

  const planIds = new Set<string>();
  for (const meal of plannedMeals) {
    planIds.add(meal.weekly_plan_id);
    const nextTitle =
      meal.is_leftovers || meal.title.endsWith(" (leftovers)")
        ? `${input.title} (leftovers)`
        : meal.title.endsWith(" (copy)")
          ? `${input.title} (copy)`
          : input.title;
    try {
      await query`
        UPDATE planned_meals SET
          title = ${nextTitle},
          recipe_version_id = ${version.id}
        WHERE id = ${meal.id} AND household_id = ${householdId}
      `;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Meal update failed" };
    }
  }

  const { queueGrocerySync } = await import("@meals/actions/grocery");
  for (const planId of planIds) queueGrocerySync(planId);

  await logRecipeActivity({
    householdId,
    actorUserId: user.id,
    actionType: "recipe_edited",
    recipeId,
    title: input.title,
    versionNumber: nextVersion,
    changeSummary: input.changeSummary ?? `Version ${nextVersion}`,
  });

  revalidatePath("/tools/meals/recipes", "layout");
  revalidatePath(`/tools/meals/recipes/${recipeId}`);
  revalidatePath("/tools/meals/week", "layout");
  revalidatePath("/tools/meals/grocery", "layout");
  return { success: true, versionId: version.id };
}

async function clearRecipeFromUsualMeals(
  householdId: string,
  recipeId: string,
) {
  const profiles = await query<{ id: string; meal_defaults: unknown }>`
    SELECT p.id, p.meal_defaults
    FROM profiles p
    JOIN household_members hm ON hm.user_id = p.id
    WHERE hm.household_id = ${householdId}
  `;

  for (const profile of profiles) {
    const defaults = parseMealDefaults(profile.meal_defaults);
    if (!mealDefaultsIncludeRecipe(defaults, recipeId)) continue;
    const next = omitRecipeFromMealDefaults(defaults, recipeId);
    await query`
      UPDATE profiles
      SET meal_defaults = ${JSON.stringify(next)}::jsonb
      WHERE id = ${profile.id}
    `;
  }
}

export async function deleteRecipe(recipeId: string) {
  const { user, householdId } = await requireHouseholdContext();
  const recipe = await queryOne<{ id: string; title: string; is_active: boolean }>`
    SELECT id, title, is_active FROM recipes
    WHERE id = ${recipeId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!recipe) return { error: "Recipe not found" };
  if (!recipe.is_active) return { success: true as const };

  try {
    await query`
      UPDATE recipes
      SET is_active = false
      WHERE id = ${recipeId} AND household_id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed" };
  }

  await clearRecipeFromUsualMeals(householdId, recipeId);
  await logRecipeActivity({
    householdId,
    actorUserId: user.id,
    actionType: "recipe_deleted",
    recipeId,
    title: recipe.title,
  });

  revalidatePath("/tools/meals/recipes", "layout");
  revalidatePath(`/tools/meals/recipes/${recipeId}`);
  revalidatePath("/tools/meals/settings");
  revalidatePath("/tools/meals/week", "layout");
  return { success: true as const };
}

export async function restoreRecipe(recipeId: string) {
  const { user, householdId } = await requireHouseholdContext();
  const recipe = await queryOne<{ id: string; title: string; is_active: boolean }>`
    SELECT id, title, is_active FROM recipes
    WHERE id = ${recipeId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!recipe) return { error: "Recipe not found" };
  if (recipe.is_active) return { success: true as const };

  try {
    await query`
      UPDATE recipes
      SET is_active = true
      WHERE id = ${recipeId} AND household_id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Restore failed" };
  }

  await logRecipeActivity({
    householdId,
    actorUserId: user.id,
    actionType: "recipe_restored",
    recipeId,
    title: recipe.title,
  });

  revalidatePath("/tools/meals/recipes", "layout");
  revalidatePath(`/tools/meals/recipes/${recipeId}`);
  return { success: true as const };
}

export async function toggleRecipeLike(recipeId: string) {
  const { user, householdId } = await requireHouseholdContext();
  const recipe = await queryOne<{ id: string }>`
    SELECT id FROM recipes
    WHERE id = ${recipeId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!recipe) return { error: "Not found" };

  const existing = await queryOne<{ id: string }>`
    SELECT id FROM recipe_likes
    WHERE recipe_id = ${recipeId} AND user_id = ${user.id}
    LIMIT 1
  `;

  if (existing) {
    try {
      await query`
        DELETE FROM recipe_likes
        WHERE id = ${existing.id} AND user_id = ${user.id}
      `;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Unlike failed" };
    }
  } else {
    try {
      await query`
        INSERT INTO recipe_likes (user_id, recipe_id, household_id)
        VALUES (${user.id}, ${recipeId}, ${householdId})
      `;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Like failed" };
    }
  }

  revalidatePath("/tools/meals/recipes");
  revalidatePath(`/tools/meals/recipes/${recipeId}`);
  return { success: true, liked: !existing };
}
