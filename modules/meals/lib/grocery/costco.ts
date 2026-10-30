export const STAPLE_NAMES = [
  "rice",
  "pasta",
  "olive oil",
  "butter",
  "eggs",
  "flour",
  "sugar",
  "salt",
  "black pepper",
  "vegetable oil",
  "chicken broth",
  "vegetable broth",
  "soy sauce",
  "garlic",
  "onion",
  "oats",
  "quinoa",
  "bread",
  "milk",
  "cheese",
] as const;

export const PROTEIN_KEYWORDS = [
  "chicken",
  "beef",
  "pork",
  "turkey",
  "salmon",
  "shrimp",
  "fish",
  "ground beef",
  "ground turkey",
  "steak",
  "bacon",
  "sausage",
  "cod",
  "tuna",
  "lamb",
] as const;

export interface CostcoEvaluationInput {
  ingredientName: string;
  normalizedName: string;
  mealCount: number;
  totalQuantity: number;
  unit: string;
  manualPreference?: boolean;
}

const LARGE_QUANTITY_THRESHOLDS: Record<string, number> = {
  cup: 6,
  tbsp: 24,
  tsp: 48,
  lb: 3,
  oz: 32,
  g: 1500,
  kg: 1.5,
  ml: 1500,
  l: 1.5,
  clove: 12,
  can: 4,
  bunch: 4,
  piece: 12,
  item: 12,
};

function isStaple(normalizedName: string): boolean {
  return STAPLE_NAMES.some((staple) => {
    if (normalizedName === staple) return true;
    // Multi-word staples: "extra virgin olive oil" matches "olive oil".
    // Single-word staples stay exact so "garlic powder" ≠ "garlic".
    return staple.includes(" ") && normalizedName.endsWith(staple);
  });
}

function isFreezerFriendlyProtein(normalizedName: string): boolean {
  return PROTEIN_KEYWORDS.some((keyword) => normalizedName.includes(keyword));
}

function hasLargeQuantity(totalQuantity: number, unit: string): boolean {
  const threshold = LARGE_QUANTITY_THRESHOLDS[unit];
  if (threshold === undefined) {
    return totalQuantity >= 10;
  }
  return totalQuantity >= threshold;
}

export function evaluateCostcoCandidate(
  input: CostcoEvaluationInput,
): { isCandidate: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (input.manualPreference) {
    reasons.push("Marked as Costco bulk preference");
  }

  if (input.mealCount >= 3) {
    reasons.push(`Used across ${input.mealCount} meals`);
  }

  if (hasLargeQuantity(input.totalQuantity, input.unit)) {
    reasons.push(
      `Large total quantity (${input.totalQuantity} ${input.unit})`,
    );
  }

  if (isFreezerFriendlyProtein(input.normalizedName)) {
    reasons.push("Freezer-friendly protein");
  }

  if (isStaple(input.normalizedName)) {
    reasons.push("Common pantry staple");
  }

  return {
    isCandidate: reasons.length > 0,
    reasons,
  };
}
