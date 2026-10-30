"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateRecipeForIdea } from "@meals/actions/ai";
import {
  createRecipe,
  findHouseholdRecipeByTitle,
  listHouseholdRecipeSummaries,
} from "@meals/actions/recipes";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { isAiEnabled } from "@meals/lib/env";
import { matchIdeaToLibrary } from "@meals/lib/ideas/match";
import {
  aiRecipeToDraft,
  draftToCreateInput,
  type RecipeDraft,
} from "@meals/lib/recipes/recipe-draft";
import { buildQuickIdeaRecipe } from "@meals/lib/recipes/quick-idea";

const draftSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  cuisine: z.string().nullable().optional(),
  mealTypes: z.array(z.string()).min(1),
  defaultServings: z.number().int().positive(),
  prepTimeMinutes: z.number().nullable().optional(),
  cookTimeMinutes: z.number().nullable().optional(),
  totalTimeMinutes: z.number().nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  freezingSuitable: z.boolean().nullable().optional(),
  ingredients: z
    .array(
      z.object({
        ingredientName: z.string().min(1),
        quantity: z.number().nullable().optional(),
        unit: z.string().nullable().optional(),
        preparationNote: z.string().nullable().optional(),
        optional: z.boolean().optional(),
        groceryCategory: z.string().nullable().optional(),
      }),
    )
    .min(1),
  steps: z.array(z.string().min(1)).min(1),
});

export type RecipeLookupCandidate = RecipeDraft & {
  source: "ai" | "quick";
};

export type SimilarRecipeHit = {
  id: string;
  title: string;
};

/** One-shot lookup: household first, then a generated baseline draft. Does not save. */
export async function lookupRecipeByQuery(
  query: string,
  opts?: { forceCreate?: boolean },
) {
  const q = query.trim();
  if (q.length < 2) {
    return { error: "Enter at least 2 characters." };
  }

  await requireHouseholdContext();

  if (!opts?.forceCreate) {
    const library = await listHouseholdRecipeSummaries();
    const { exact, similar } = matchIdeaToLibrary(q, library);
    if (exact) {
      return {
        existing: { id: exact.id, title: exact.title },
        similar: [] as SimilarRecipeHit[],
        candidates: [] as RecipeLookupCandidate[],
      };
    }
    if (similar.length) {
      return {
        existing: null as null,
        similar: similar.map((row) => ({ id: row.id, title: row.title })),
        candidates: [] as RecipeLookupCandidate[],
      };
    }
  }

  if (isAiEnabled()) {
    const generated = await generateRecipeForIdea({
      mealIdea: q,
      save: false,
      forceCreate: true,
    });
    if (generated.error) {
      return { error: generated.error };
    }
    if (generated.recipe) {
      return {
        existing: null as null,
        similar: [] as SimilarRecipeHit[],
        candidates: [
          {
            ...aiRecipeToDraft(generated.recipe),
            source: "ai" as const,
          },
        ],
      };
    }
  }

  const quick = buildQuickIdeaRecipe(q);
  return {
    existing: null as null,
    similar: [] as SimilarRecipeHit[],
    candidates: [{ ...quick, source: "quick" as const }],
  };
}

/** Confirm a looked-up draft and add it to the household recipe book. */
export async function confirmImportRecipe(input: {
  recipe: unknown;
  source?: "ai" | "quick";
}) {
  await requireHouseholdContext();
  const parsed = draftSchema.safeParse(input.recipe);
  if (!parsed.success) {
    return { error: "Invalid recipe draft. Search again." };
  }

  const existingMatches = await findHouseholdRecipeByTitle(parsed.data.title);
  const existing = existingMatches[0];
  if (existing) {
    return {
      success: true as const,
      recipeId: existing.id,
      title: existing.title,
      alreadyExisted: true as const,
    };
  }

  const sourceName = input.source === "quick" ? "quick" : "ai";
  const created = await createRecipe({
    ...draftToCreateInput(parsed.data as RecipeDraft, sourceName),
    sourceType: input.source === "quick" ? "household" : "ai",
  });

  if ("error" in created && created.error) {
    return { error: created.error };
  }

  revalidatePath("/tools/meals/recipes");
  revalidatePath("/tools/meals/week");
  return {
    success: true as const,
    recipeId: "recipeId" in created ? created.recipeId : undefined,
    title: parsed.data.title,
  };
}

/**
 * Resolve a typed dish name into a household recipe for planning:
 * library match → AI baseline (if enabled) → practical quick draft.
 */
export async function ensureRecipeForMealPlan(input: {
  title: string;
  mealType?: string;
  catalogRecipe?: unknown;
}) {
  const title = input.title.trim();
  if (title.length < 2) {
    return { error: "Enter a dish name." };
  }

  try {
    await requireHouseholdContext();

    const library = await listHouseholdRecipeSummaries();
    const { exact } = matchIdeaToLibrary(title, library);
    if (exact) {
      return {
        success: true as const,
        recipeId: exact.id,
        title: exact.title,
        source: "library" as const,
      };
    }

    if (input.catalogRecipe) {
      const imported = await confirmImportRecipe({
        recipe: input.catalogRecipe,
        source: "ai",
      });
      if (imported.error && !imported.recipeId) {
        return { error: imported.error };
      }
      if (imported.recipeId) {
        return {
          success: true as const,
          recipeId: imported.recipeId,
          title: imported.title ?? title,
          source: "ai" as const,
        };
      }
    }

    if (isAiEnabled()) {
      const generated = await generateRecipeForIdea({
        mealIdea: title,
        servings: 1,
        notes: input.mealType
          ? `Intended for ${input.mealType.replace("_", " ")}`
          : undefined,
        save: true,
        forceCreate: true,
      });
      if (!generated.error) {
        if (generated.usedHouseholdRecipe && generated.recipes?.[0]) {
          return {
            success: true as const,
            recipeId: generated.recipes[0].id,
            title: generated.recipes[0].title,
            source: "library" as const,
          };
        }
        const saved = generated.saved as
          | { recipeId?: string; error?: string }
          | undefined;
        if (saved?.recipeId && generated.recipe) {
          return {
            success: true as const,
            recipeId: saved.recipeId,
            title: generated.recipe.title,
            source: "ai" as const,
          };
        }
      }
    }

    const quick = buildQuickIdeaRecipe(title, input.mealType ?? "dinner");
    const created = await confirmImportRecipe({
      recipe: quick,
      source: "quick",
    });
    if (!created.recipeId) {
      return { error: created.error ?? "Could not create recipe." };
    }
    return {
      success: true as const,
      recipeId: created.recipeId,
      title: created.title ?? quick.title,
      source: "quick" as const,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not create recipe.",
    };
  }
}
