import { createRecipe, updateRecipeAsNewVersion } from "@meals/actions/recipes";
import type { GenerateContext } from "@meals/lib/ai/generate";
import { generationError } from "@meals/lib/ai/generation-error";
import type { FullRecipePayload } from "@meals/lib/ai/idea-schemas";
import {
  createOpenAiClient,
  createStructuredCaller,
} from "@meals/lib/ai/openai-structured";
import { neonGenerateStore } from "@meals/lib/ai/store";
import { getAiBudgetConfig, getEnv, isAiEnabled } from "@meals/lib/env";

export function createGenerateContext(
  user: { id: string; email: string },
  householdId: string,
): GenerateContext {
  const env = getEnv();
  const client = env.OPENAI_API_KEY
    ? createOpenAiClient(env.OPENAI_API_KEY)
    : null;
  return {
    user,
    householdId,
    now: new Date(),
    newId: () => crypto.randomUUID(),
    openai: client
      ? createStructuredCaller(client)
      : async () => {
          throw generationError("not_configured");
        },
    store: neonGenerateStore,
    budget: getAiBudgetConfig(),
    apiKeyPresent: isAiEnabled(),
    recipes: {
      async create(recipe: FullRecipePayload) {
        const saved = await createRecipe({
          title: recipe.title,
          description: null,
          sourceType: "ai",
          sourceName: "gpt-5.4-mini",
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
        });
        if ("error" in saved && saved.error) {
          throw generationError("database");
        }
        if (!("recipeId" in saved) || !saved.recipeId) {
          throw generationError("database");
        }
        return { recipeId: saved.recipeId };
      },
      async update(recipeId, recipe) {
        const saved = await updateRecipeAsNewVersion(recipeId, {
          title: recipe.title,
          description: null,
          sourceType: "ai",
          sourceName: "gpt-5.4-mini",
          mealTypes: ["dinner"],
          dietaryTags: recipe.dietaryFlags,
          defaultServings: recipe.servings,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          totalTimeMinutes: recipe.prepTimeMinutes + recipe.cookTimeMinutes,
          equipment: [],
          storageInstructions: recipe.storageNotes,
          leftoverNotes: recipe.substitutions.join("; ") || null,
          ingredients: recipe.ingredients.map((i) => ({
            ingredientName: i.ingredientName,
            quantity: i.quantity,
            unit: i.unit,
            preparationNote: i.preparationNote,
            optional: i.optional,
          })),
          steps: recipe.instructions.map((instruction) => ({ instruction })),
        });
        if ("error" in saved && saved.error) {
          throw generationError("database");
        }
      },
    },
  };
}
