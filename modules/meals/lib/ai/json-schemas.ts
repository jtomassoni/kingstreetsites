/** OpenAI strict JSON schemas. All properties required; additionalProperties false. */

export function mealIdeasJsonSchema(mealCount: number) {
  const count = Math.min(7, Math.max(1, Math.floor(mealCount)));
  return {
    type: "object",
    additionalProperties: false,
    required: ["ideas"],
    properties: {
      ideas: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "generatedId",
            "name",
            "description",
            "cuisine",
            "prepTimeMinutes",
            "cookTimeMinutes",
            "difficulty",
            "primaryProtein",
            "ingredientPreview",
            "applicableMembers",
            "fitReason",
          ],
          properties: {
            generatedId: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            cuisine: { type: "string" },
            prepTimeMinutes: { type: "integer" },
            cookTimeMinutes: { type: "integer" },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            primaryProtein: { type: "string" },
            ingredientPreview: {
              type: "array",
              items: { type: "string" },
            },
            applicableMembers: {
              type: "array",
              items: { type: "string" },
            },
            fitReason: { type: "string" },
          },
        },
      },
    },
  } as const;
}

/** @deprecated Use mealIdeasJsonSchema(mealCount) */
export const MEAL_IDEAS_JSON_SCHEMA = mealIdeasJsonSchema(1);

export const FULL_RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "servings",
    "prepTimeMinutes",
    "cookTimeMinutes",
    "ingredients",
    "instructions",
    "substitutions",
    "dietaryFlags",
    "storageNotes",
  ],
  properties: {
    title: { type: "string" },
    servings: { type: "number" },
    prepTimeMinutes: { type: "integer" },
    cookTimeMinutes: { type: "integer" },
    ingredients: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "ingredientName",
          "quantity",
          "unit",
          "preparationNote",
          "optional",
        ],
        properties: {
          ingredientName: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          preparationNote: { type: ["string", "null"] },
          optional: { type: "boolean" },
        },
      },
    },
    instructions: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
    substitutions: {
      type: "array",
      items: { type: "string" },
    },
    dietaryFlags: {
      type: "array",
      items: { type: "string" },
    },
    storageNotes: { type: ["string", "null"] },
  },
} as const;

export const SEARCH_RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["familiar", "recipe"],
  properties: {
    familiar: { type: "boolean" },
    recipe: {
      anyOf: [{ type: "null" }, FULL_RECIPE_JSON_SCHEMA],
    },
  },
} as const;
