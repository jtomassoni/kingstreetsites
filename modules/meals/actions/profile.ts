"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query } from "@meals/lib/db";
import {
  dayMealNeedsSchema,
  type DayMealNeeds,
} from "@meals/lib/meals/day-needs";
import {
  mealDefaultsSchema,
  type MealDefaults,
} from "@meals/lib/meals/defaults";

export async function updateProfile(input: {
  displayName?: string;
  dietaryRestrictions?: string[];
  ingredientDislikes?: string[];
  ingredientPreferences?: string[];
  favoriteCuisines?: string[];
  nutritionNotes?: string | null;
  dayMealNeeds?: DayMealNeeds;
  mealDefaults?: MealDefaults;
}) {
  const { user, householdId } = await requireHouseholdContext();

  let dayMealNeeds = input.dayMealNeeds;
  if (dayMealNeeds !== undefined) {
    const parsed = dayMealNeedsSchema.safeParse(dayMealNeeds);
    if (!parsed.success) return { error: "Invalid day meal needs" };
    dayMealNeeds = parsed.data;
  }

  let mealDefaults = input.mealDefaults;
  if (mealDefaults !== undefined) {
    const parsed = mealDefaultsSchema.safeParse(mealDefaults);
    if (!parsed.success) return { error: "Invalid meal defaults" };

    // Usual meals must reference active library recipes (no free text).
    mealDefaults = {
      breakfast: parsed.data.breakfast.filter((o) => o.recipeId),
      lunch: parsed.data.lunch.filter((o) => o.recipeId),
      dinner: parsed.data.dinner.filter((o) => o.recipeId),
    };

    const recipeIds = [
      ...mealDefaults.breakfast,
      ...mealDefaults.lunch,
      ...mealDefaults.dinner,
    ].map((o) => o.recipeId!);

    if (
      parsed.data.breakfast.length +
        parsed.data.lunch.length +
        parsed.data.dinner.length !==
      recipeIds.length
    ) {
      return { error: "Usual meals must be active recipes from your library." };
    }

    if (recipeIds.length) {
      const active = await query<{ id: string }>`
        SELECT id FROM recipes
        WHERE household_id = ${householdId}
          AND is_active = true
          AND id = ANY(${recipeIds}::uuid[])
      `;
      const activeSet = new Set(active.map((r) => r.id));
      if (recipeIds.some((id) => !activeSet.has(id))) {
        return {
          error: "Usual meals must be active recipes from your library.",
        };
      }
    }
  }

  try {
    await query`
      UPDATE profiles SET
        display_name = COALESCE(${input.displayName ?? null}, display_name),
        dietary_restrictions = COALESCE(${input.dietaryRestrictions ?? null}, dietary_restrictions),
        ingredient_dislikes = COALESCE(${input.ingredientDislikes ?? null}, ingredient_dislikes),
        ingredient_preferences = COALESCE(${input.ingredientPreferences ?? null}, ingredient_preferences),
        favorite_cuisines = COALESCE(${input.favoriteCuisines ?? null}, favorite_cuisines),
        nutrition_notes = CASE
          WHEN ${input.nutritionNotes !== undefined} THEN ${input.nutritionNotes ?? null}
          ELSE nutrition_notes
        END,
        day_meal_needs = CASE
          WHEN ${dayMealNeeds !== undefined}
            THEN ${JSON.stringify(dayMealNeeds ?? null)}::jsonb
          ELSE day_meal_needs
        END,
        meal_defaults = CASE
          WHEN ${mealDefaults !== undefined}
            THEN ${JSON.stringify(mealDefaults ?? null)}::jsonb
          ELSE meal_defaults
        END
      WHERE id = ${user.id}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }

  revalidatePath("/tools/meals/settings");
  revalidatePath("/tools/meals", "layout");
  return { success: true };
}
