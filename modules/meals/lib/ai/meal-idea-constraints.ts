import type { MealIdeaPayload } from "@meals/lib/ai/idea-schemas";
import type { MealIdeaRecord } from "@meals/lib/ai/store";

function ideaText(idea: MealIdeaPayload): string {
  return [
    idea.name,
    idea.description,
    idea.primaryProtein,
    ...idea.ingredientPreview,
    idea.fitReason,
  ]
    .join(" ")
    .toLowerCase();
}

function dishText(idea: MealIdeaPayload): string {
  return [
    idea.name,
    idea.description,
    idea.primaryProtein,
    ...idea.ingredientPreview,
  ]
    .join(" ")
    .toLowerCase();
}

export function mealIdeaRecordToPayload(record: MealIdeaRecord): MealIdeaPayload {
  return {
    generatedId: record.generated_id,
    name: record.name,
    description: record.description,
    cuisine: record.cuisine ?? "",
    prepTimeMinutes: record.prep_time_minutes ?? 0,
    cookTimeMinutes: record.cook_time_minutes ?? 0,
    difficulty: record.difficulty ?? "easy",
    primaryProtein: record.primary_protein ?? "",
    ingredientPreview: record.ingredient_preview ?? [],
    applicableMembers: record.applicable_members ?? [],
    fitReason: record.fit_reason ?? "",
  };
}

function termMatchesExclusion(text: string, exclusion: string): boolean {
  const term = exclusion.toLowerCase().trim();
  if (!term) return false;
  if (term === "spicy") {
    return /\b(spicy|hot sauce|sriracha|jalapeño|jalapeno|chili|chile)\b/.test(
      text,
    );
  }
  if (term === "dairy") {
    return /\b(cheese|cream|milk|butter|yogurt|parmesan|mozzarella|dairy)\b/.test(
      text,
    );
  }
  if (term === "gluten") {
    return /\b(pasta|bread|flour|wheat|noodle|spaghetti|penne|gluten)\b/.test(
      text,
    );
  }
  if (term === "shellfish") {
    return /\b(shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|shellfish)\b/.test(
      text,
    );
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`, "i").test(text);
}

function ingredientInText(ingredient: string, text: string): boolean {
  const term = ingredient.toLowerCase().trim();
  if (!term) return true;
  if (text.includes(term)) return true;
  const words = term.split(/\s+/).filter((word) => word.length > 3);
  return words.length > 0 && words.every((word) => text.includes(word));
}

const PROTEIN_TERMS = [
  "chicken",
  "ground beef",
  "beef",
  "pork",
  "lamb",
  "turkey",
  "salmon",
  "shrimp",
  "fish",
  "tofu",
  "eggs",
  "black beans",
] as const;

const PROTEIN_CONFLICTS: Record<string, readonly string[]> = {
  chicken: [
    "beef",
    "pork",
    "lamb",
    "veal",
    "bolognese",
    "steak",
    "ground beef",
    "meatball",
    "ragù",
    "ragu",
    "sausage",
    "bacon",
    "ham",
    "prosciutto",
    "meat sauce",
    "mince",
  ],
  "ground beef": [
    "chicken",
    "turkey",
    "poultry",
    "salmon",
    "shrimp",
    "fish",
    "tofu",
  ],
  beef: ["chicken", "turkey", "poultry", "tofu"],
  salmon: ["chicken", "beef", "pork", "ground beef", "turkey", "tofu"],
  shrimp: ["chicken", "beef", "pork", "ground beef", "turkey", "tofu"],
  tofu: ["chicken", "beef", "pork", "ground beef", "salmon", "shrimp"],
  eggs: ["beef", "pork", "ground beef", "bolognese"],
};

function proteinTermsInList(values: string[]): string[] {
  const found = new Set<string>();
  for (const value of values) {
    const lower = value.toLowerCase();
    for (const protein of PROTEIN_TERMS) {
      if (lower.includes(protein)) found.add(protein);
    }
  }
  return [...found];
}

function hasProteinConflict(
  chosenProteins: string[],
  idea: MealIdeaPayload,
): boolean {
  if (!chosenProteins.length) return false;
  const text = dishText(idea);
  for (const chosen of chosenProteins) {
    const forbidden = PROTEIN_CONFLICTS[chosen] ?? [];
    if (forbidden.some((term) => text.includes(term))) return true;
  }
  if (chosenProteins.length === 1) {
    const chosen = chosenProteins[0]!;
    const primary = idea.primaryProtein.toLowerCase();
    if (!primary.includes(chosen) && !chosen.includes(primary.split(/\s+/)[0] ?? "")) {
      return true;
    }
  }
  return false;
}

export function ideaMatchesConstraints(
  idea: MealIdeaPayload,
  availableIngredients: string[],
  exclusions: string[],
): boolean {
  const content = dishText(idea);
  const fullText = ideaText(idea);

  for (const exclusion of exclusions) {
    if (termMatchesExclusion(content, exclusion)) return false;
  }

  if (availableIngredients.length) {
    const missing = availableIngredients.filter(
      (ingredient) => !ingredientInText(ingredient, fullText),
    );
    if (missing.length) return false;

    const chosenProteins = proteinTermsInList(availableIngredients);
    if (chosenProteins.length && hasProteinConflict(chosenProteins, idea)) {
      return false;
    }
  }

  return true;
}

export function filterMealIdeasByConstraints(
  ideas: MealIdeaPayload[],
  availableIngredients: string[],
  exclusions: string[],
): MealIdeaPayload[] {
  return ideas.filter((idea) =>
    ideaMatchesConstraints(idea, availableIngredients, exclusions),
  );
}

export function filterMealIdeaRecordsByConstraints(
  ideas: MealIdeaRecord[],
  availableIngredients: string[],
  exclusions: string[],
): MealIdeaRecord[] {
  return ideas.filter((idea) =>
    ideaMatchesConstraints(
      mealIdeaRecordToPayload(idea),
      availableIngredients,
      exclusions,
    ),
  );
}

export function buildMealIdeasInstruction(input: {
  mealCount: number;
  availableIngredients: string[];
  exclusions: string[];
  cuisines: string[];
  notes?: string;
}): string {
  const lines = [
    `Return exactly ${input.mealCount} real, widely known dish idea${input.mealCount === 1 ? "" : "s"}. No drinks. No invented mashups.`,
  ];

  if (input.availableIngredients.length) {
    lines.push(
      `Required ingredients to use up: ${input.availableIngredients.join(", ")}.`,
      "The dish must be built around these — especially any protein listed.",
      "Set primaryProtein to the main protein from that list.",
      "ingredientPreview must list the required ingredients.",
      "Never substitute a different main protein (e.g. do not suggest beef pasta when chicken was requested).",
    );
  }

  if (input.exclusions.length) {
    lines.push(
      `Hard exclusions — do NOT suggest dishes containing or centered on: ${input.exclusions.join(", ")}.`,
    );
  }

  if (input.cuisines.length) {
    lines.push(`Prefer these cuisines when possible: ${input.cuisines.join(", ")}.`);
  }

  if (input.notes?.trim()) {
    lines.push(`Additional preferences: ${input.notes.trim()}.`);
  }

  lines.push(
    "fitReason must explain how the dish uses the required ingredients and respects exclusions.",
  );

  return lines.join(" ");
}
