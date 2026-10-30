import { inferGrocerySection } from "@meals/lib/grocery/sections";

export type RecipeDraftIngredient = {
  ingredientName: string;
  quantity?: number | null;
  unit?: string | null;
  preparationNote?: string | null;
  optional?: boolean;
  groceryCategory?: string | null;
};

/** Shared shape for imported/looked-up recipes before save. */
export type RecipeDraft = {
  id: string;
  title: string;
  description?: string | null;
  cuisine?: string | null;
  mealTypes: string[];
  defaultServings: number;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  totalTimeMinutes?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  freezingSuitable?: boolean | null;
  ingredients: RecipeDraftIngredient[];
  steps: string[];
};

/** @deprecated Prefer RecipeDraft — kept for fewer call-site renames during migration. */
export type StarterRecipe = RecipeDraft;

export function slugDraftId(prefix: string, title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}:${slug || "recipe"}`;
}

/** Map a generated AI recipe payload onto the shared draft shape. */
export function aiRecipeToDraft(
  recipe: {
    title: string;
    description?: string | null;
    cuisine?: string | null;
    mealTypes?: string[];
    defaultServings?: number;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    totalTimeMinutes?: number | null;
    difficulty?: "easy" | "medium" | "hard" | null;
    freezingSuitable?: boolean | null;
    ingredients: RecipeDraftIngredient[];
    steps: { instruction: string }[] | string[];
  },
  id?: string,
): RecipeDraft {
  return {
    id: id ?? slugDraftId("ai", recipe.title),
    title: recipe.title,
    description: recipe.description ?? null,
    cuisine: recipe.cuisine ?? null,
    mealTypes: recipe.mealTypes?.length ? recipe.mealTypes : ["dinner"],
    defaultServings: recipe.defaultServings ?? 1,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    difficulty: recipe.difficulty ?? null,
    freezingSuitable: recipe.freezingSuitable ?? null,
    ingredients: recipe.ingredients,
    steps: recipe.steps.map((step) =>
      typeof step === "string" ? step : step.instruction,
    ),
  };
}

export function draftToCreateInput(
  recipe: RecipeDraft,
  sourceName = "ai",
) {
  return {
    title: recipe.title,
    description: recipe.description ?? null,
    sourceType: "imported" as const,
    sourceName,
    cuisine: recipe.cuisine ?? null,
    mealTypes: recipe.mealTypes,
    dietaryTags: [] as string[],
    defaultServings: recipe.defaultServings,
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    equipment: [] as string[],
    freezingSuitable: recipe.freezingSuitable ?? null,
    difficulty: recipe.difficulty ?? null,
    ingredients: recipe.ingredients.map((i) => ({
      ingredientName: i.ingredientName,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      preparationNote: i.preparationNote ?? null,
      optional: i.optional ?? false,
      groceryCategory:
        i.groceryCategory ?? inferGrocerySection(i.ingredientName),
    })),
    steps: recipe.steps.map((instruction) => ({ instruction })),
  };
}

export const starterRecipeToCreateInput = draftToCreateInput;
