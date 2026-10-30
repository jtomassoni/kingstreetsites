import {
  isCooldownActive,
  type BudgetConfig,
} from "@meals/lib/ai/budget";
import { GenerationError, generationError } from "@meals/lib/ai/generation-error";
import { requestHash } from "@meals/lib/ai/idempotency";
import {
  fullRecipeSchema,
  mealIdeasResponseSchema,
  searchRecipeResponseSchema,
  type FullRecipePayload,
  type MealIdeaPayload,
} from "@meals/lib/ai/idea-schemas";
import {
  FULL_RECIPE_JSON_SCHEMA,
  mealIdeasJsonSchema,
  SEARCH_RECIPE_JSON_SCHEMA,
} from "@meals/lib/ai/json-schemas";
import {
  buildMealIdeasInstruction,
  filterMealIdeasByConstraints,
  filterMealIdeaRecordsByConstraints,
} from "@meals/lib/ai/meal-idea-constraints";
import {
  AI_LIMITS,
  boundStringList,
  boundText,
  clampMealCount,
  maxOutputTokensFor,
  type GenerationOperation,
} from "@meals/lib/ai/limits";
import type { StructuredOpenAiCaller } from "@meals/lib/ai/openai-structured";
import {
  estimateCostUsd,
  OPENAI_RECIPE_MODEL,
  roundUsd,
} from "@meals/lib/ai/pricing";
import {
  FULL_RECIPE_SYSTEM_PROMPT,
  MEAL_IDEAS_SYSTEM_PROMPT,
  SEARCH_RECIPE_SYSTEM_PROMPT,
} from "@meals/lib/ai/prompts";
import { isKnownDrinkQuery } from "@meals/lib/ai/familiarity";
import { normalizeQuery, stripLeadingArticles } from "@meals/lib/ai/normalize-query";
import type {
  AiGenerationRecord,
  GenerateStore,
  MealIdeaRecord,
} from "@meals/lib/ai/store";
import type { ExtractedUsage } from "@meals/lib/ai/usage";

export type GenerateUser = { id: string; email: string };

export type HouseholdPrefs = {
  members: {
    displayName: string;
    dietaryRestrictions: string[];
    dislikes: string[];
    preferences: string[];
    favoriteCuisines: string[];
  }[];
};

export type MealIdeasCommand = {
  weeklyPlanId: string;
  weekStart: string;
  mealCount?: number;
  dietaryFlags?: string[];
  availableIngredients?: string[];
  exclusions?: string[];
  cuisines?: string[];
  notes?: string;
  existingMeals: { title: string }[];
  householdPrefs: HouseholdPrefs;
  replaceIdeaId?: string;
};

export type FullRecipeCommand = {
  mealIdeaId: string;
  regenerate?: boolean;
};

export type RecipeWriter = {
  create(recipe: FullRecipePayload): Promise<{ recipeId: string }>;
  update(recipeId: string, recipe: FullRecipePayload): Promise<void>;
};

export type GenerateContext = {
  user: GenerateUser;
  householdId: string;
  now: Date;
  newId: () => string;
  openai: StructuredOpenAiCaller;
  store: GenerateStore;
  budget: BudgetConfig;
  apiKeyPresent: boolean;
  recipes?: RecipeWriter;
};

function costFromUsage(usage: ExtractedUsage): number {
  return roundUsd(
    estimateCostUsd({
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    }),
  );
}

async function assertReady(
  ctx: GenerateContext,
  _operation: GenerationOperation,
) {
  if (!ctx.apiKeyPresent) throw generationError("not_configured");

  const last = await ctx.store.lastUserRequestAt(ctx.user.id);
  if (
    isCooldownActive({
      lastRequestAt: last,
      now: ctx.now,
      cooldownMs: AI_LIMITS.cooldownMs,
    })
  ) {
    throw generationError("cooldown");
  }
}

async function claimGeneration(
  ctx: GenerateContext,
  input: {
    operation: GenerationOperation;
    requestHash: string;
    relatedPlanId?: string | null;
    relatedMealIdeaId?: string | null;
    relatedWeekStart?: string | null;
    inputSummary: string;
  },
): Promise<{ generation: AiGenerationRecord; reused: boolean }> {
  const staleBefore = new Date(ctx.now.getTime() - AI_LIMITS.pendingStaleMs);
  await ctx.store.expireStalePending(
    ctx.householdId,
    input.requestHash,
    staleBefore,
  );

  const existing = await ctx.store.findActiveByHash(
    ctx.householdId,
    input.requestHash,
  );
  if (existing?.output_status === "success") {
    return { generation: existing, reused: true };
  }
  if (existing?.output_status === "pending") {
    throw generationError("in_progress");
  }

  const pendingId = ctx.newId();
  const created = await ctx.store.insertPending({
    id: pendingId,
    householdId: ctx.householdId,
    userId: ctx.user.id,
    operationType: input.operation,
    relatedPlanId: input.relatedPlanId,
    relatedMealIdeaId: input.relatedMealIdeaId,
    relatedWeekStart: input.relatedWeekStart,
    model: OPENAI_RECIPE_MODEL,
    inputSummary: input.inputSummary,
    requestHash: input.requestHash,
  });

  if (created.output_status === "success") {
    return { generation: created, reused: true };
  }
  if (created.id !== pendingId || created.output_status !== "pending") {
    throw generationError("in_progress");
  }

  return { generation: created, reused: false };
}

async function failGeneration(
  ctx: GenerateContext,
  generationId: string,
  err: unknown,
  usage: ExtractedUsage | null,
) {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "unknown";
  try {
    await ctx.store.finishGeneration({
      id: generationId,
      status: code === "invalid_response" ? "validation_failed" : "error",
      usage,
      costUsd: usage ? costFromUsage(usage) : 0,
      errorCategory: code,
    });
  } catch {
    // Avoid masking the original generation error.
  }
}

function boundPayload(command: MealIdeasCommand) {
  const mealCount = clampMealCount(command.mealCount);
  const dietaryFlags = boundStringList(command.dietaryFlags);
  const availableIngredients = boundStringList(command.availableIngredients);
  const exclusions = boundStringList(command.exclusions);
  const cuisines = boundStringList(command.cuisines);
  const notes = boundText(command.notes, AI_LIMITS.maxNotesChars);
  const existingMeals = command.existingMeals
    .map((m) => boundText(m.title, 80))
    .filter(Boolean)
    .slice(0, 40)
    .sort((a, b) => a.localeCompare(b));

  const userPayload = JSON.stringify({
    weekStart: command.weekStart,
    mealCount,
    dietaryFlags,
    availableIngredients,
    exclusions,
    cuisines,
    notes,
    existingMeals,
    householdPrefs: command.householdPrefs,
    replaceIdeaId: command.replaceIdeaId ?? null,
    instruction: buildMealIdeasInstruction({
      mealCount,
      availableIngredients,
      exclusions,
      cuisines,
      notes,
    }),
  });

  if (userPayload.length > AI_LIMITS.maxUserPayloadChars) {
    throw generationError(
      "invalid_response",
      "That request is too long. Shorten notes or ingredient lists and try again.",
    );
  }

  return {
    mealCount,
    dietaryFlags,
    availableIngredients,
    exclusions,
    cuisines,
    notes,
    existingMeals,
    userPayload,
  };
}

export function mealIdeasHash(
  householdId: string,
  command: MealIdeasCommand,
): string {
  const bounded = boundPayload(command);
  return requestHash({
    op: "generate_meal_ideas",
    model: OPENAI_RECIPE_MODEL,
    householdId,
    weeklyPlanId: command.weeklyPlanId,
    weekStart: command.weekStart,
    mealCount: bounded.mealCount,
    dietaryFlags: bounded.dietaryFlags,
    availableIngredients: bounded.availableIngredients,
    exclusions: bounded.exclusions,
    cuisines: bounded.cuisines,
    notes: bounded.notes,
    existingMeals: bounded.existingMeals,
    prefs: command.householdPrefs,
    replaceIdeaId: command.replaceIdeaId ?? null,
  });
}

export function fullRecipeHash(
  householdId: string,
  ideaId: string,
  regenerate: boolean,
  existingRecipeUpdatedAt: string | null,
): string {
  return requestHash({
    op: "generate_full_recipe",
    model: OPENAI_RECIPE_MODEL,
    householdId,
    ideaId,
    regenerate,
    existingRecipeUpdatedAt: regenerate ? existingRecipeUpdatedAt : null,
  });
}

export function searchRecipeHash(query: string, notes = ""): string {
  const extra = boundText(notes, AI_LIMITS.maxNotesChars);
  return requestHash({
    op: "generate_recipe_from_search",
    model: OPENAI_RECIPE_MODEL,
    query: stripLeadingArticles(normalizeQuery(query)),
    notes: extra || null,
  });
}

async function rememberCachedRecipe(
  ctx: GenerateContext,
  query: string,
  recipe: FullRecipePayload,
  generationId?: string | null,
  options?: { aliasTitle?: boolean; notes?: string },
) {
  const normalized = stripLeadingArticles(normalizeQuery(query));
  if (!normalized) return;
  const notes = options?.notes ?? "";
  await ctx.store.upsertCachedResponse({
    requestHash: searchRecipeHash(normalized, notes),
    operationType: "generate_recipe_from_search",
    queryNormalized: normalized,
    status: "familiar",
    payload: recipe,
    generationId,
  });
  const titleKey = stripLeadingArticles(normalizeQuery(recipe.title));
  if (options?.aliasTitle !== false && titleKey && titleKey !== normalized) {
    await ctx.store.upsertCachedResponse({
      requestHash: searchRecipeHash(titleKey),
      operationType: "generate_recipe_from_search",
      queryNormalized: titleKey,
      status: "familiar",
      payload: recipe,
      generationId,
    });
  }
}

async function rememberUnfamiliar(
  ctx: GenerateContext,
  query: string,
  notes = "",
) {
  const normalized = stripLeadingArticles(normalizeQuery(query));
  if (!normalized) return;
  await ctx.store.upsertCachedResponse({
    requestHash: searchRecipeHash(normalized, notes),
    operationType: "generate_recipe_from_search",
    queryNormalized: normalized,
    status: "unfamiliar",
    payload: {},
  });
}

export async function generateMealIdeas(
  command: MealIdeasCommand,
  ctx: GenerateContext,
): Promise<{
  ideas: MealIdeaRecord[];
  reused: boolean;
  generationId: string;
}> {
  const bounded = boundPayload(command);
  const hash = mealIdeasHash(ctx.householdId, command);

  const staleBefore = new Date(ctx.now.getTime() - AI_LIMITS.pendingStaleMs);
  await ctx.store.expireStalePending(ctx.householdId, hash, staleBefore);
  const cached = await ctx.store.findActiveByHash(ctx.householdId, hash);
  if (cached?.output_status === "success") {
    const cachedIdeas = filterMealIdeaRecordsByConstraints(
      await ctx.store.listIdeasForGeneration(ctx.householdId, cached.id),
      bounded.availableIngredients,
      bounded.exclusions,
    ).slice(0, bounded.mealCount);
    if (cachedIdeas.length >= bounded.mealCount) {
      return { ideas: cachedIdeas, reused: true, generationId: cached.id };
    }
  }

  await assertReady(ctx, "generate_meal_ideas");

  if (!command.replaceIdeaId) {
    await ctx.store.supersedePendingIdeasForPlan(
      ctx.householdId,
      command.weeklyPlanId,
    );
  }

  const claimed = await claimGeneration(ctx, {
    operation: "generate_meal_ideas",
    requestHash: hash,
    relatedPlanId: command.weeklyPlanId,
    relatedWeekStart: command.weekStart,
    inputSummary: command.replaceIdeaId
      ? `replace:${bounded.mealCount}`
      : `ideas:${bounded.mealCount}`,
  });

  if (claimed.reused) {
    const ideas = filterMealIdeaRecordsByConstraints(
      await ctx.store.listIdeasForGeneration(
        ctx.householdId,
        claimed.generation.id,
      ),
      bounded.availableIngredients,
      bounded.exclusions,
    ).slice(0, bounded.mealCount);
    return {
      ideas,
      reused: true,
      generationId: claimed.generation.id,
    };
  }

  let usage: ExtractedUsage | null = null;
  try {
    const hasConstraints =
      bounded.availableIngredients.length > 0 || bounded.exclusions.length > 0;
    let selected: MealIdeaPayload[] = [];

    for (let attempt = 0; attempt < (hasConstraints ? 3 : 1); attempt++) {
      const strictInstruction =
        attempt === 0
          ? buildMealIdeasInstruction({
              mealCount: bounded.mealCount,
              availableIngredients: bounded.availableIngredients,
              exclusions: bounded.exclusions,
              cuisines: bounded.cuisines,
              notes: bounded.notes,
            })
          : `${buildMealIdeasInstruction({
              mealCount: bounded.mealCount,
              availableIngredients: bounded.availableIngredients,
              exclusions: bounded.exclusions,
              cuisines: bounded.cuisines,
              notes: bounded.notes,
            })} Previous suggestions violated the constraints. Obey them exactly.`;

      const payload =
        attempt === 0
          ? bounded.userPayload
          : JSON.stringify({
              ...JSON.parse(bounded.userPayload),
              instruction: strictInstruction,
            });

      const result = await ctx.openai({
        operation: "generate_meal_ideas",
        systemPrompt: MEAL_IDEAS_SYSTEM_PROMPT,
        userPayload: payload,
        schemaName: "meal_ideas",
        jsonSchema: mealIdeasJsonSchema(bounded.mealCount) as unknown as Record<
          string,
          unknown
        >,
        maxOutputTokens: maxOutputTokensFor("generate_meal_ideas"),
      });
      usage = result.usage;

      const parsed = mealIdeasResponseSchema.safeParse(result.parsedJson);
      if (!parsed.success) {
        throw generationError("invalid_response");
      }

      selected = filterMealIdeasByConstraints(
        parsed.data.ideas
          .filter((idea) => !isKnownDrinkQuery(idea.name))
          .slice(0, bounded.mealCount),
        bounded.availableIngredients,
        bounded.exclusions,
      );

      if (selected.length >= bounded.mealCount) break;
    }

    if (!selected.length) {
      throw generationError(
        "invalid_response",
        hasConstraints
          ? "Could not find a dish that matches your ingredients and exclusions. Try fewer constraints or different inputs."
          : undefined,
      );
    }

    selected = selected.slice(0, bounded.mealCount);
    if (!usage) {
      throw generationError("invalid_response");
    }
    const finalUsage = usage;
    const toInsert = selected.map((idea: MealIdeaPayload) => ({
      ...idea,
      generatedId: ctx.newId(),
      id: ctx.newId(),
      householdId: ctx.householdId,
      weeklyPlanId: command.weeklyPlanId,
      generationId: claimed.generation.id,
      createdBy: ctx.user.id,
    }));

    if (command.replaceIdeaId) {
      const replacement = toInsert[0];
      if (replacement) {
        await ctx.store.updateIdeaStatus(
          ctx.householdId,
          command.replaceIdeaId,
          "replaced",
          { replacedByIdeaId: replacement.id },
        );
      }
    }

    const ideas = await ctx.store.commitSuccessfulIdeas({
      generation: {
        id: claimed.generation.id,
        status: "success",
        usage: finalUsage,
        costUsd: costFromUsage(finalUsage),
      },
      ideas: toInsert,
    });

    return { ideas, reused: false, generationId: claimed.generation.id };
  } catch (err) {
    await failGeneration(ctx, claimed.generation.id, err, usage);
    throw err;
  }
}

export async function generateFullRecipe(
  command: FullRecipeCommand,
  ctx: GenerateContext,
): Promise<{
  recipe: FullRecipePayload;
  recipeId: string;
  reused: boolean;
  generationId: string | null;
}> {
  const idea = await ctx.store.getIdea(ctx.householdId, command.mealIdeaId);
  if (!idea) throw generationError("not_found");

  const stored = await ctx.store.getGeneratedRecipe(
    ctx.householdId,
    command.mealIdeaId,
  );
  if (stored && !command.regenerate) {
    return {
      recipe: stored.payload,
      recipeId: stored.recipe_id,
      reused: true,
      generationId: stored.generation_id,
    };
  }

  if (!ctx.recipes) {
    throw generationError("database");
  }

  await assertReady(ctx, "generate_full_recipe");
  const hash = fullRecipeHash(
    ctx.householdId,
    command.mealIdeaId,
    Boolean(command.regenerate),
    stored?.updated_at ?? null,
  );

  const claimed = await claimGeneration(ctx, {
    operation: "generate_full_recipe",
    requestHash: hash,
    relatedPlanId: idea.weekly_plan_id,
    relatedMealIdeaId: idea.id,
    inputSummary: boundText(idea.name, 80),
  });

  if (claimed.reused) {
    const again = await ctx.store.getGeneratedRecipe(
      ctx.householdId,
      command.mealIdeaId,
    );
    if (again) {
      return {
        recipe: again.payload,
        recipeId: again.recipe_id,
        reused: true,
        generationId: claimed.generation.id,
      };
    }
    throw generationError("database");
  }

  let usage: ExtractedUsage | null = null;
  try {
    const result = await ctx.openai({
      operation: "generate_full_recipe",
      systemPrompt: FULL_RECIPE_SYSTEM_PROMPT,
      userPayload: JSON.stringify({
        idea: {
          name: idea.name,
          description: idea.description,
          cuisine: idea.cuisine,
          prepTimeMinutes: idea.prep_time_minutes,
          cookTimeMinutes: idea.cook_time_minutes,
          difficulty: idea.difficulty,
          primaryProtein: idea.primary_protein,
          ingredientPreview: idea.ingredient_preview,
          applicableMembers: idea.applicable_members,
          fitReason: idea.fit_reason,
        },
      }).slice(0, AI_LIMITS.maxUserPayloadChars),
      schemaName: "full_recipe",
      jsonSchema: FULL_RECIPE_JSON_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: maxOutputTokensFor("generate_full_recipe"),
    });
    usage = result.usage;

    const parsed = fullRecipeSchema.safeParse(result.parsedJson);
    if (!parsed.success) {
      throw generationError("invalid_response");
    }

    let recipeId = stored?.recipe_id;
    if (recipeId && command.regenerate) {
      await ctx.recipes.update(recipeId, parsed.data);
    } else {
      const created = await ctx.recipes.create(parsed.data);
      recipeId = created.recipeId;
    }

    if (!recipeId) throw generationError("database");

    const saved = await ctx.store.commitSuccessfulRecipe({
      generation: {
        id: claimed.generation.id,
        status: "success",
        usage,
        costUsd: costFromUsage(usage),
        relatedRecipeId: recipeId,
        relatedMealIdeaId: idea.id,
      },
      householdId: ctx.householdId,
      mealIdeaId: idea.id,
      recipeId,
      payload: parsed.data,
    });

    await rememberCachedRecipe(
      ctx,
      idea.name,
      saved.payload,
      claimed.generation.id,
    );

    return {
      recipe: saved.payload,
      recipeId: saved.recipe_id,
      reused: false,
      generationId: claimed.generation.id,
    };
  } catch (err) {
    await failGeneration(ctx, claimed.generation.id, err, usage);
    throw err;
  }
}

export async function setMealIdeaStatus(
  ctx: Pick<GenerateContext, "store" | "householdId">,
  ideaId: string,
  status: "approved" | "rejected",
): Promise<MealIdeaRecord> {
  const updated = await ctx.store.updateIdeaStatus(
    ctx.householdId,
    ideaId,
    status,
  );
  if (!updated) throw generationError("not_found");
  return updated;
}

export async function generateRecipeFromSearch(
  idea: string,
  ctx: GenerateContext,
  notes?: string,
): Promise<{
  recipe: FullRecipePayload;
  reused: boolean;
  generationId: string | null;
}> {
  const query = boundText(idea, 120);
  const extraNotes = boundText(notes, AI_LIMITS.maxNotesChars);
  if (query.length < 2) {
    throw generationError("unfamiliar");
  }

  const hash = searchRecipeHash(query, extraNotes);
  const cached = await ctx.store.getCachedResponse(hash);
  if (cached?.status === "unfamiliar") {
    throw generationError("unfamiliar");
  }
  if (cached?.status === "familiar") {
    const parsed = fullRecipeSchema.safeParse(cached.payload);
    if (parsed.success) {
      return {
        recipe: parsed.data,
        reused: true,
        generationId: cached.generation_id,
      };
    }
  }

  if (isKnownDrinkQuery(query)) {
    await rememberUnfamiliar(ctx, query);
    throw generationError("unfamiliar");
  }

  await assertReady(ctx, "generate_recipe_from_search");

  const claimed = await claimGeneration(ctx, {
    operation: "generate_recipe_from_search",
    requestHash: hash,
    inputSummary: query,
  });

  if (claimed.reused) {
    const again = await ctx.store.getCachedResponse(hash);
    if (again?.status === "unfamiliar") throw generationError("unfamiliar");
    if (again?.status === "familiar") {
      const parsed = fullRecipeSchema.safeParse(again.payload);
      if (parsed.success) {
        return {
          recipe: parsed.data,
          reused: true,
          generationId: claimed.generation.id,
        };
      }
    }
  }

  let usage: ExtractedUsage | null = null;
  try {
    const result = await ctx.openai({
      operation: "generate_recipe_from_search",
      systemPrompt: SEARCH_RECIPE_SYSTEM_PROMPT,
      userPayload: JSON.stringify({
        idea: query,
        notes: extraNotes || undefined,
      }),
      schemaName: "search_recipe",
      jsonSchema: SEARCH_RECIPE_JSON_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      maxOutputTokens: maxOutputTokensFor("generate_recipe_from_search"),
    });
    usage = result.usage;

    const parsed = searchRecipeResponseSchema.safeParse(result.parsedJson);
    if (!parsed.success) {
      throw generationError("invalid_response");
    }

    if (!parsed.data.familiar || !parsed.data.recipe) {
      await rememberUnfamiliar(ctx, query, extraNotes);
      await ctx.store.finishGeneration({
        id: claimed.generation.id,
        status: "success",
        usage,
        costUsd: costFromUsage(usage),
        errorCategory: "unfamiliar",
      });
      throw generationError("unfamiliar");
    }

    await rememberCachedRecipe(
      ctx,
      query,
      parsed.data.recipe,
      claimed.generation.id,
      { aliasTitle: !extraNotes, notes: extraNotes },
    );
    await ctx.store.finishGeneration({
      id: claimed.generation.id,
      status: "success",
      usage,
      costUsd: costFromUsage(usage),
    });

    return {
      recipe: parsed.data.recipe,
      reused: false,
      generationId: claimed.generation.id,
    };
  } catch (err) {
    if (err instanceof GenerationError && err.code === "unfamiliar") {
      throw err;
    }
    await failGeneration(ctx, claimed.generation.id, err, usage);
    throw err;
  }
}
