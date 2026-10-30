"use server";

import { revalidatePath } from "next/cache";
import { generateRecipeForIdea } from "@meals/actions/ai";
import { confirmImportRecipe } from "@meals/actions/catalog-recipes";
import { listHouseholdRecipeSummaries } from "@meals/actions/recipes";
import {
  classifyAiError,
  formatAiErrorMessage,
  type AiErrorKind,
} from "@meals/lib/ai/errors";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query } from "@meals/lib/db";
import { isAiEnabled } from "@meals/lib/env";
import { matchIdeaToLibrary } from "@meals/lib/ideas/match";
import { buildQuickIdeaRecipe } from "@meals/lib/recipes/quick-idea";

export type CapturedIdea = {
  id: string;
  title: string;
  source: "library" | "ai";
  mealTypes: string[];
  createdAt: string;
  needsReview?: boolean;
};

export type SimilarRecipeHit = {
  id: string;
  title: string;
  mealTypes: string[];
  createdAt: string;
};

export type CaptureIdeaResult =
  | {
      success: true;
      kind: "reused" | "created";
      source: "library" | "ai";
      recipe: {
        id: string;
        title: string;
        mealTypes: string[];
        createdAt: string;
      };
      message: string;
    }
  | {
      success: true;
      kind: "similar";
      idea: string;
      similar: SimilarRecipeHit[];
      message: string;
    }
  | { success: false; error: string; errorKind?: AiErrorKind };

function toHit(row: {
  id: string;
  title: string;
  meal_types: string[] | null;
  created_at: string;
}): SimilarRecipeHit {
  return {
    id: row.id,
    title: row.title,
    mealTypes: row.meal_types ?? [],
    createdAt: row.created_at,
  };
}

async function createBaselineRecipe(idea: string): Promise<
  | { error: string; errorKind?: AiErrorKind }
  | {
      source: "library" | "ai";
      recipeId: string;
      title: string;
      mealTypes: string[];
    }
> {
  if (isAiEnabled()) {
    const result = await generateRecipeForIdea({
      mealIdea: idea,
      save: true,
      forceCreate: true,
    });
    if (result.error) {
      return {
        error: result.error,
        errorKind:
          "errorKind" in result
            ? (result.errorKind as AiErrorKind | undefined)
            : undefined,
      };
    }
    if (result.usedHouseholdRecipe) {
      const first = result.recipes?.[0];
      if (!first) return { error: "Library match failed unexpectedly." };
      return {
        source: "library" as const,
        recipeId: first.id,
        title: first.title,
        mealTypes: [] as string[],
      };
    }
    const saved = result.saved as
      | { success?: boolean; recipeId?: string; error?: string }
      | undefined;
    if (saved?.error) return { error: saved.error };
    if (!saved?.recipeId || !result.recipe) {
      return { error: "Recipe was generated but not saved." };
    }
    return {
      source: "ai" as const,
      recipeId: saved.recipeId,
      title: result.recipe.title,
      mealTypes: result.recipe.mealTypes ?? [],
    };
  }

  const quick = buildQuickIdeaRecipe(idea);
  const created = await confirmImportRecipe({
    recipe: quick,
    source: "quick",
  });
  if (!created.recipeId) {
    return { error: created.error ?? "Could not create a baseline recipe." };
  }
  return {
    source: "ai" as const,
    recipeId: created.recipeId,
    title: created.title ?? quick.title,
    mealTypes: quick.mealTypes,
  };
}

/** Capture a meal idea: reuse exact library match, confirm similar, else draft a baseline. */
export async function captureIdea(input: {
  idea: string;
  forceCreate?: boolean;
  useRecipeId?: string;
}): Promise<CaptureIdeaResult> {
  const idea = input.idea.trim();
  if (idea.length < 2) {
    return { success: false, error: "Type at least a couple characters." };
  }

  const recipes = await listHouseholdRecipeSummaries();

  if (input.useRecipeId) {
    const chosen = recipes.find((row) => row.id === input.useRecipeId);
    if (!chosen) {
      return { success: false, error: "That recipe is no longer in your library." };
    }
    revalidatePath("/tools/meals/ideas");
    return {
      success: true,
      kind: "reused",
      source: "library",
      recipe: {
        id: chosen.id,
        title: chosen.title,
        mealTypes: chosen.meal_types ?? [],
        createdAt: chosen.created_at,
      },
      message: `Using “${chosen.title}” from your library.`,
    };
  }

  if (!input.forceCreate) {
    const { exact, similar } = matchIdeaToLibrary(idea, recipes);
    if (exact) {
      revalidatePath("/tools/meals/ideas");
      return {
        success: true,
        kind: "reused",
        source: "library",
        recipe: {
          id: exact.id,
          title: exact.title,
          mealTypes: exact.meal_types ?? [],
          createdAt: exact.created_at,
        },
        message: `Found “${exact.title}” in your library.`,
      };
    }
    if (similar.length) {
      return {
        success: true,
        kind: "similar",
        idea,
        similar: similar.map(toHit),
        message:
          similar.length === 1
            ? `Hey, there’s something similar: “${similar[0]!.title}”. Still add a new recipe for “${idea}”?`
            : `Hey, there are similar recipes already. Still add a new recipe for “${idea}”?`,
      };
    }
  }

  try {
    const created = await createBaselineRecipe(idea);
    if ("error" in created) {
      return {
        success: false,
        error: created.error,
        errorKind: created.errorKind,
      };
    }

    revalidatePath("/tools/meals/ideas");
    revalidatePath("/tools/meals/recipes");
    return {
      success: true,
      kind: "created",
      source: created.source,
      recipe: {
        id: created.recipeId,
        title: created.title,
        mealTypes: created.mealTypes,
        createdAt: new Date().toISOString(),
      },
      message: `Drafted “${created.title}”. You can edit the baseline anytime.`,
    };
  } catch (err) {
    const classified = classifyAiError(err);
    return {
      success: false,
      error: formatAiErrorMessage(err),
      errorKind: classified.kind,
    };
  }
}

/** Recent recipes as a stand-in for the ideas inbox (newest first). */
export async function listRecentIdeas(limit = 20): Promise<CapturedIdea[]> {
  const { householdId } = await requireHouseholdContext();
  const data = await query<{
    id: string;
    title: string;
    meal_types: string[] | null;
    source_type: string;
    created_at: string;
  }>`
    SELECT id, title, meal_types, source_type, created_at
    FROM recipes
    WHERE household_id = ${householdId} AND is_active = true
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    source: row.source_type === "ai" ? ("ai" as const) : ("library" as const),
    mealTypes: row.meal_types ?? [],
    createdAt: row.created_at,
  }));
}
