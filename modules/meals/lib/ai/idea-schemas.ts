import { z } from "zod";

export const mealIdeaDifficultySchema = z.enum(["easy", "medium", "hard"]);

export const mealIdeaSchema = z.object({
  generatedId: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(280),
  cuisine: z.string().min(1).max(60),
  prepTimeMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60),
  cookTimeMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60),
  difficulty: mealIdeaDifficultySchema,
  primaryProtein: z.string().min(1).max(80),
  ingredientPreview: z.array(z.string().min(1).max(80)).min(1).max(12),
  applicableMembers: z.array(z.string().min(1).max(80)).min(1).max(8),
  fitReason: z.string().min(1).max(280),
});

export const mealIdeasResponseSchema = z.object({
  ideas: z.array(mealIdeaSchema).min(1).max(7),
});

export type MealIdeaPayload = z.infer<typeof mealIdeaSchema>;
export type MealIdeasResponse = z.infer<typeof mealIdeasResponseSchema>;

export const fullRecipeIngredientSchema = z.object({
  ingredientName: z.string().min(1).max(120),
  quantity: z.number().nullable(),
  unit: z.string().max(40).nullable(),
  preparationNote: z.string().max(120).nullable(),
  optional: z.boolean(),
});

export const fullRecipeSchema = z.object({
  title: z.string().min(1).max(120),
  servings: z.number().positive().max(24),
  prepTimeMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60),
  cookTimeMinutes: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60),
  ingredients: z.array(fullRecipeIngredientSchema).min(1).max(40),
  instructions: z.array(z.string().min(1).max(500)).min(1).max(30),
  substitutions: z.array(z.string().min(1).max(200)).max(12),
  dietaryFlags: z.array(z.string().min(1).max(80)).max(12),
  storageNotes: z.string().max(400).nullable(),
});

export type FullRecipePayload = z.infer<typeof fullRecipeSchema>;

export const searchRecipeResponseSchema = z
  .object({
    familiar: z.boolean(),
    recipe: fullRecipeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.familiar && !value.recipe) {
      ctx.addIssue({
        code: "custom",
        message: "A recipe is required when the dish is familiar.",
        path: ["recipe"],
      });
    }
  });

export type SearchRecipeResponse = z.infer<typeof searchRecipeResponseSchema>;

export const generateMealIdeasInputSchema = z.object({
  weeklyPlanId: z.string().uuid(),
  weekStart: z.string().min(8).max(10),
  mealCount: z.number().int().min(1).max(7).optional(),
  dietaryFlags: z.array(z.string().max(80)).max(12).optional(),
  availableIngredients: z.array(z.string().max(80)).max(40).optional(),
  exclusions: z.array(z.string().max(80)).max(40).optional(),
  cuisines: z.array(z.string().max(80)).max(20).optional(),
  notes: z.string().max(500).optional(),
  replaceIdeaId: z.string().uuid().optional(),
});

export const generateFullRecipeInputSchema = z.object({
  mealIdeaId: z.string().uuid(),
  regenerate: z.boolean().optional(),
});
