function parseQuantity(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.includes("/")) {
      const [numerator, denominator] = trimmed.split("/").map((part) => part.trim());
      const num = Number(numerator);
      const den = Number(denominator);
      if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
        return num / den;
      }
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseInteger(value: unknown): number | null | undefined {
  const parsed = parseQuantity(value);
  if (parsed == null) return parsed;
  return Math.round(parsed);
}

function normalizeStep(step: unknown): { instruction: string } | null {
  if (typeof step === "string") {
    const instruction = step.trim();
    return instruction ? { instruction } : null;
  }
  if (!step || typeof step !== "object") return null;
  const record = step as Record<string, unknown>;
  const instruction = String(
    record.instruction ?? record.text ?? record.step ?? record.description ?? "",
  ).trim();
  return instruction ? { instruction } : null;
}

function normalizeIngredient(ingredient: unknown): Record<string, unknown> | null {
  if (typeof ingredient === "string") {
    const ingredientName = ingredient.trim();
    return ingredientName ? { ingredientName } : null;
  }
  if (!ingredient || typeof ingredient !== "object") return null;

  const record = ingredient as Record<string, unknown>;
  const ingredientName = String(
    record.ingredientName ?? record.name ?? record.item ?? record.ingredient ?? "",
  ).trim();
  if (!ingredientName) return null;

  return {
    ingredientName,
    quantity: parseQuantity(record.quantity),
    unit:
      record.unit == null || record.unit === ""
        ? null
        : String(record.unit).trim() || null,
    preparationNote:
      record.preparationNote == null || record.preparationNote === ""
        ? null
        : String(record.preparationNote).trim() || null,
    optional:
      typeof record.optional === "boolean"
        ? record.optional
        : record.optional == null
          ? undefined
          : Boolean(record.optional),
    groceryCategory:
      record.groceryCategory == null || record.groceryCategory === ""
        ? null
        : String(record.groceryCategory).trim() || null,
  };
}

function unwrapRecipeObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.recipe && typeof record.recipe === "object") {
    return record.recipe as Record<string, unknown>;
  }
  if (record.data && typeof record.data === "object") {
    return record.data as Record<string, unknown>;
  }
  return record;
}

/** Coerce common AI recipe JSON shapes into the aiRecipe schema shape. */
export function normalizeAiRecipeJson(raw: unknown): unknown {
  const obj = unwrapRecipeObject(raw);
  if (!obj) return raw;

  const ingredients = Array.isArray(obj.ingredients)
    ? obj.ingredients
        .map(normalizeIngredient)
        .filter((item): item is Record<string, unknown> => item != null)
    : [];

  const rawSteps = Array.isArray(obj.steps)
    ? obj.steps
    : Array.isArray(obj.instructions)
      ? obj.instructions
      : [];
  const steps = rawSteps
    .map(normalizeStep)
    .filter((item): item is { instruction: string } => item != null);

  const title = String(obj.title ?? obj.name ?? "").trim();
  const defaultServings = parseQuantity(obj.defaultServings ?? obj.servings) ?? 1;

  return {
    title,
    description:
      obj.description == null || obj.description === ""
        ? null
        : String(obj.description).trim() || null,
    cuisine:
      obj.cuisine == null || obj.cuisine === ""
        ? null
        : String(obj.cuisine).trim() || null,
    mealTypes: Array.isArray(obj.mealTypes)
      ? obj.mealTypes.map((value) => String(value).trim()).filter(Boolean)
      : [],
    dietaryTags: Array.isArray(obj.dietaryTags)
      ? obj.dietaryTags.map((value) => String(value).trim()).filter(Boolean)
      : [],
    defaultServings: defaultServings > 0 ? defaultServings : 1,
    prepTimeMinutes: parseInteger(obj.prepTimeMinutes),
    cookTimeMinutes: parseInteger(obj.cookTimeMinutes),
    totalTimeMinutes: parseInteger(obj.totalTimeMinutes),
    equipment: Array.isArray(obj.equipment)
      ? obj.equipment.map((value) => String(value).trim()).filter(Boolean)
      : [],
    storageInstructions:
      obj.storageInstructions == null || obj.storageInstructions === ""
        ? null
        : String(obj.storageInstructions).trim() || null,
    reheatingInstructions:
      obj.reheatingInstructions == null || obj.reheatingInstructions === ""
        ? null
        : String(obj.reheatingInstructions).trim() || null,
    freezingSuitable:
      typeof obj.freezingSuitable === "boolean" ? obj.freezingSuitable : null,
    leftoverNotes:
      obj.leftoverNotes == null || obj.leftoverNotes === ""
        ? null
        : String(obj.leftoverNotes).trim() || null,
    difficulty:
      obj.difficulty === "easy" ||
      obj.difficulty === "medium" ||
      obj.difficulty === "hard"
        ? obj.difficulty
        : null,
    ingredients,
    steps,
  };
}
