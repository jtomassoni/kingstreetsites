"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query, queryOne } from "@meals/lib/db";
import { updateRecipeAsNewVersion, type RecipeInput } from "@meals/actions/recipes";
import type { MealHistory, MealPhoto } from "@meals/types/database";

export async function listMealHistory(filters?: {
  q?: string;
  minRating?: number;
}) {
  const { householdId } = await requireHouseholdContext();

  const rows = filters?.minRating
    ? await query<MealHistory>`
        SELECT * FROM meal_history
        WHERE household_id = ${householdId}
          AND overall_rating >= ${filters.minRating}
        ORDER BY cooked_at DESC
      `
    : await query<MealHistory>`
        SELECT * FROM meal_history
        WHERE household_id = ${householdId}
        ORDER BY cooked_at DESC
      `;

  const recipeIds = [
    ...new Set(rows.map((r) => r.recipe_id).filter(Boolean)),
  ] as string[];
  const entryIds = rows.map((r) => r.id);

  const recipes = recipeIds.length
    ? await query<{ id: string; title: string }>`
        SELECT id, title FROM recipes WHERE id = ANY(${recipeIds}::uuid[])
      `
    : [];
  const photos = entryIds.length
    ? await query<
        Pick<
          MealPhoto,
          "id" | "meal_history_id" | "storage_path" | "thumbnail_path" | "alt_text"
        >
      >`
        SELECT id, meal_history_id, storage_path, thumbnail_path, alt_text
        FROM meal_photos
        WHERE meal_history_id = ANY(${entryIds}::uuid[])
      `
    : [];

  const recipeMap = new Map(recipes.map((r) => [r.id, r]));
  const photosByEntry = new Map<string, typeof photos>();
  for (const photo of photos) {
    const list = photosByEntry.get(photo.meal_history_id) ?? [];
    list.push(photo);
    photosByEntry.set(photo.meal_history_id, list);
  }

  let enriched = rows.map((r) => ({
    ...r,
    recipes: r.recipe_id ? recipeMap.get(r.recipe_id) ?? null : null,
    meal_photos: photosByEntry.get(r.id) ?? [],
  }));

  if (filters?.q?.trim()) {
    const needle = filters.q.trim().toLowerCase();
    enriched = enriched.filter((r) => {
      const title = r.recipes?.title ?? "";
      return (
        title.toLowerCase().includes(needle) ||
        (r.review ?? "").toLowerCase().includes(needle)
      );
    });
  }
  return enriched;
}

export async function getMealHistoryEntry(id: string) {
  const { householdId } = await requireHouseholdContext();
  const data = await queryOne<MealHistory>`
    SELECT * FROM meal_history
    WHERE id = ${id} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!data) return null;

  const [recipe, version, photos, participants] = await Promise.all([
    data.recipe_id
      ? queryOne<{ title: string }>`
          SELECT title FROM recipes WHERE id = ${data.recipe_id} LIMIT 1
        `
      : Promise.resolve(null),
    data.recipe_version_id
      ? queryOne<import("@meals/types/database").RecipeVersion>`
          SELECT * FROM recipe_versions WHERE id = ${data.recipe_version_id} LIMIT 1
        `
      : Promise.resolve(null),
    query<MealPhoto>`
      SELECT * FROM meal_photos WHERE meal_history_id = ${id}
    `,
    query<import("@meals/types/database").Tables<"meal_history_participants">>`
      SELECT * FROM meal_history_participants WHERE meal_history_id = ${id}
    `,
  ]);

  return {
    ...data,
    recipes: recipe,
    recipe_versions: version,
    meal_photos: photos,
    meal_history_participants: participants,
  };
}

export async function createMealHistory(input: {
  plannedMealId?: string | null;
  recipeId?: string | null;
  recipeVersionId?: string | null;
  cookedAt?: string;
  cookedFor?: "both" | "specific";
  cookedForUserId?: string | null;
  overallRating?: number | null;
  review?: string | null;
  wouldMakeAgain?: "yes" | "maybe" | "no" | null;
  tags?: string[];
  participantRatings?: { userId: string; rating: number }[];
  recipeUpdate?: RecipeInput | null;
}) {
  const { user, householdId } = await requireHouseholdContext();

  let recipeVersionId = input.recipeVersionId ?? null;
  let recipeId = input.recipeId ?? null;

  if (input.plannedMealId) {
    const meal = await queryOne<{
      recipe_id: string | null;
      recipe_version_id: string | null;
    }>`
      SELECT recipe_id, recipe_version_id FROM planned_meals
      WHERE id = ${input.plannedMealId}
      LIMIT 1
    `;
    if (meal) {
      recipeId = recipeId ?? meal.recipe_id;
      recipeVersionId = recipeVersionId ?? meal.recipe_version_id;
    }
  }

  const cookedFor = input.cookedFor ?? "both";
  const entry = await queryOne<{ id: string }>`
    INSERT INTO meal_history (
      household_id, planned_meal_id, recipe_id, recipe_version_id,
      cooked_at, cooked_for, cooked_for_user_id, cooked_by,
      overall_rating, review, would_make_again, tags, created_by
    ) VALUES (
      ${householdId},
      ${input.plannedMealId ?? null},
      ${recipeId},
      ${recipeVersionId},
      ${input.cookedAt ?? new Date().toISOString()},
      ${cookedFor},
      ${cookedFor === "specific" ? input.cookedForUserId ?? null : null},
      ${user.id},
      ${input.overallRating ?? null},
      ${input.review ?? null},
      ${input.wouldMakeAgain ?? null},
      ${input.tags ?? []},
      ${user.id}
    )
    RETURNING id
  `;

  if (!entry) return { error: "Failed" };

  if (input.participantRatings?.length) {
    for (const p of input.participantRatings) {
      await query`
        INSERT INTO meal_history_participants (
          meal_history_id, household_id, user_id, individual_rating
        ) VALUES (
          ${entry.id}, ${householdId}, ${p.userId}, ${p.rating}
        )
      `;
    }
  }

  if (input.recipeUpdate && recipeId) {
    await updateRecipeAsNewVersion(recipeId, input.recipeUpdate);
  }

  revalidatePath("/tools/meals/history");
  return { success: true, id: entry.id };
}
