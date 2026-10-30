import type { RecipeDraft } from "@meals/lib/recipes/recipe-draft";
import { DEFAULT_RECIPE_SERVINGS } from "@meals/lib/meals/appetite";

function slugId(title: string) {
  return `quick:${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Practical household drafts for common dishes TheMealDB often misses. */
export function buildQuickIdeaRecipe(
  title: string,
  mealType = "dinner",
): RecipeDraft {
  const clean = title.trim().replace(/\s+/g, " ");
  const lower = clean.toLowerCase();
  const servings = DEFAULT_RECIPE_SERVINGS;

  const isBec =
    (lower.includes("bacon") && lower.includes("egg")) ||
    lower.includes("bec") ||
    (lower.includes("egg") && lower.includes("cheese") && lower.includes("bacon"));

  if (isBec) {
    return {
      id: slugId(clean),
      title: clean,
      description:
        "Classic bacon, egg, and cheese — on whatever breakfast bread you like (bagel, roll, English muffin, or toast).",
      cuisine: "American",
      mealTypes: mealType === "snack_prep" ? ["breakfast", "snack_prep"] : ["breakfast"],
      defaultServings: servings,
      prepTimeMinutes: 5,
      cookTimeMinutes: 15,
      totalTimeMinutes: 20,
      difficulty: "easy",
      freezingSuitable: false,
      ingredients: [
        {
          ingredientName: "eggs",
          quantity: servings,
          unit: "large",
          groceryCategory: "dairy",
        },
        {
          ingredientName: "bacon",
          quantity: servings * 2,
          unit: "slices",
          groceryCategory: "meat",
        },
        {
          ingredientName: "cheese slices",
          quantity: servings,
          unit: "slices",
          groceryCategory: "dairy",
          preparationNote: "American, cheddar, or whatever you like",
        },
        {
          ingredientName: "breakfast bread",
          quantity: servings,
          unit: "pieces",
          groceryCategory: "bakery",
          preparationNote: "bagel, roll, English muffin, or toast",
        },
        {
          ingredientName: "butter",
          quantity: 0.5,
          unit: "tbsp",
          optional: true,
          groceryCategory: "dairy",
        },
      ],
      steps: [
        "Cook the bacon until crisp; drain on a paper towel.",
        "Cook the eggs your way (fried, scrambled, or over-easy).",
        "Toast or warm the bread.",
        "Stack egg, cheese, and bacon on the bread so the cheese melts a bit. Season and eat.",
      ],
    };
  }

  return {
    id: slugId(clean),
    title: clean,
    description: `Household recipe for ${clean}. Tweak ingredients next time if you want.`,
    cuisine: null,
    mealTypes: [mealType],
    defaultServings: servings,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    difficulty: "easy",
    freezingSuitable: null,
    ingredients: [
      {
        ingredientName: clean,
        quantity: servings,
        unit: "servings",
        groceryCategory: "other",
        preparationNote: "Edit this recipe with real ingredients when you can",
      },
    ],
    steps: [
      `Prepare ${clean}.`,
      "Season to taste and serve.",
    ],
  };
}

export function titleMatchesQuery(title: string, query: string): boolean {
  const t = title.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q || !t) return false;
  if (t.includes(q)) return true;
  const tokens = q.split(/[^a-z0-9]+/).filter((tok) => tok.length >= 2);
  if (!tokens.length) return false;
  return tokens.every((tok) => t.includes(tok));
}
