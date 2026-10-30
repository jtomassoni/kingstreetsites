import type { AiRecipe } from "@meals/lib/ai/schemas";
import { resolveGrocerySection } from "@meals/lib/grocery/sections";

export type ParsedRecipeFormFields = {
  title: string;
  description: string;
  cuisine: string;
  defaultServings: number;
  difficulty: string;
  ingredients: {
    ingredientName: string;
    quantity: string;
    unit: string;
    preparationNote: string;
    groceryCategory: string;
  }[];
  steps: { instruction: string }[];
};

/** Map a parsed AI recipe onto the editable form fields. */
export function aiRecipeToFormFields(recipe: AiRecipe): ParsedRecipeFormFields {
  return {
    title: recipe.title,
    description: recipe.description ?? "",
    cuisine: recipe.cuisine ?? "",
    defaultServings: recipe.defaultServings || 1,
    difficulty: recipe.difficulty ?? "",
    ingredients: recipe.ingredients.map((i) => ({
      ingredientName: i.ingredientName,
      quantity: i.quantity != null ? String(i.quantity) : "",
      unit: i.unit ?? "",
      preparationNote: i.preparationNote ?? "",
      groceryCategory: resolveGrocerySection(
        i.groceryCategory,
        i.ingredientName,
      ),
    })),
    steps: recipe.steps.map((s) => ({ instruction: s.instruction })),
  };
}
