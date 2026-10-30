/** Current recipe the paste box should revise instead of replacing. */
export type RecipeParseContext = {
  title: string;
  description?: string | null;
  cuisine?: string | null;
  defaultServings?: number | null;
  difficulty?: string | null;
  ingredients: {
    ingredientName: string;
    quantity?: string | number | null;
    unit?: string | null;
    preparationNote?: string | null;
    groceryCategory?: string | null;
  }[];
  steps: { instruction: string }[];
};

export const PARSE_RECIPE_SYSTEM_PROMPT = [
  "You extract or revise a household recipe from pasted text (website copy, notes, a message, a cookbook transcript, or feedback on the recipe already in the form).",
  "Return ONLY valid JSON with this exact shape:",
  "{ title, description, cuisine, mealTypes, dietaryTags, defaultServings, prepTimeMinutes, cookTimeMinutes, totalTimeMinutes, equipment, storageInstructions, reheatingInstructions, freezingSuitable, leftoverNotes, difficulty, ingredients[{ingredientName,quantity,unit,preparationNote,optional,groceryCategory}], steps[{instruction}] }.",
  "When the user message includes a CURRENT RECIPE, the user text is usually feedback on that recipe, not a request for a new dish.",
  "Apply feedback as a small edit: keep the same dish and title, and keep every ingredient, quantity, unit, and step the feedback does not change. Adjust a step only when the note requires it (for example a cheese swap or an added ingredient).",
  "Replace the current recipe only when the user text is itself a full recipe (a dish with its own ingredients and method).",
  "If you are unsure, treat the text as feedback and preserve the current recipe.",
  "Do not invent a different cuisine, method, or dish because of a short note about cheeses, spices, or substitutions.",
  "If the paste only lists ingredients, infer simple assembly steps (at least one).",
  "Split combined ingredient lines into separate items. Quantities must be numbers (decimals OK, e.g. 0.5 for 1/2); use null if unknown.",
  "Use ingredientName (not name) and steps[{instruction}] (not instructions).",
  "groceryCategory must be one of: produce, meat_seafood, dairy, bakery, pantry, frozen, beverages, snacks, household, other.",
  "Ingredients must be edible groceries only — never containers, tupperware, portion cups, bags, or other storage ware.",
  "You cannot fetch websites. Use only the pasted text and the current recipe when one is provided.",
].join(" ");

export function hasRecipeParseContext(
  recipe: RecipeParseContext | null | undefined,
): recipe is RecipeParseContext {
  if (!recipe) return false;
  const hasTitle = recipe.title.trim().length > 0;
  const hasIngredient = recipe.ingredients.some((item) =>
    item.ingredientName.trim(),
  );
  const hasStep = recipe.steps.some((step) => step.instruction.trim());
  return hasTitle || hasIngredient || hasStep;
}

function compactRecipe(recipe: RecipeParseContext) {
  return {
    title: recipe.title.trim(),
    description: recipe.description?.trim() || null,
    cuisine: recipe.cuisine?.trim() || null,
    defaultServings: recipe.defaultServings ?? null,
    difficulty: recipe.difficulty?.trim() || null,
    ingredients: recipe.ingredients
      .filter((item) => item.ingredientName.trim())
      .map((item) => ({
        ingredientName: item.ingredientName.trim(),
        quantity: item.quantity === "" ? null : (item.quantity ?? null),
        unit: item.unit?.trim() || null,
        preparationNote: item.preparationNote?.trim() || null,
        groceryCategory: item.groceryCategory?.trim() || null,
      })),
    steps: recipe.steps
      .map((step) => step.instruction.trim())
      .filter(Boolean)
      .map((instruction) => ({ instruction })),
  };
}

export function buildParseRecipeUserPrompt(
  text: string,
  currentRecipe?: RecipeParseContext | null,
): string {
  if (!hasRecipeParseContext(currentRecipe)) {
    return `Parse this pasted text into a recipe JSON:\n\n${text}`;
  }

  return [
    "CURRENT RECIPE:",
    JSON.stringify(compactRecipe(currentRecipe)),
    "",
    "USER TEXT:",
    text,
    "",
    "If the user text is feedback, a correction, a substitution, an addition, or a removal, return the current recipe with only those changes.",
    "Copy defaultServings and every unchanged quantity, unit, and step verbatim. Do not rescale to 1 serving and do not merge or rewrite steps.",
    "Keep the same title and every ingredient the feedback does not mention.",
    "If the user text is a full replacement recipe, parse that recipe instead.",
  ].join("\n");
}
