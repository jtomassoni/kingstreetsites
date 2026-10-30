import { query, queryOne, withTransaction } from "@meals/lib/db";
import { estimateCostUsd, roundUsd, type TokenUsage } from "@meals/lib/ai/pricing";
import type { ExtractedUsage } from "@meals/lib/ai/usage";
import type { FullRecipePayload, MealIdeaPayload } from "@meals/lib/ai/idea-schemas";
import type { GenerationOperation } from "@meals/lib/ai/limits";

export type GenerationStatus =
  "pending" | "success" | "error" | "validation_failed";

export type AiGenerationRecord = {
  id: string;
  household_id: string;
  requested_by: string | null;
  operation_type: string;
  related_plan_id: string | null;
  related_recipe_id: string | null;
  related_meal_idea_id: string | null;
  related_week_start: string | null;
  model: string | null;
  input_summary: string | null;
  output_status: GenerationStatus;
  request_hash: string | null;
  openai_request_id: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: string | number | null;
  error_category: string | null;
  usage_missing: boolean;
  created_at: string;
};

export type MealIdeaRecord = {
  id: string;
  household_id: string;
  weekly_plan_id: string;
  generation_id: string | null;
  generated_id: string;
  name: string;
  description: string;
  cuisine: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  primary_protein: string | null;
  ingredient_preview: string[];
  applicable_members: string[];
  fit_reason: string | null;
  status: "pending_review" | "approved" | "rejected" | "replaced";
  recipe_id: string | null;
  replaced_by_idea_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GeneratedRecipeRecord = {
  id: string;
  household_id: string;
  meal_idea_id: string;
  generation_id: string | null;
  recipe_id: string;
  payload: FullRecipePayload;
  created_at: string;
  updated_at: string;
};

export type InsertGenerationInput = {
  id: string;
  householdId: string;
  userId: string;
  operationType: GenerationOperation;
  relatedPlanId?: string | null;
  relatedMealIdeaId?: string | null;
  relatedWeekStart?: string | null;
  model: string;
  inputSummary: string;
  requestHash: string;
};

export type FinishGenerationInput = {
  id: string;
  status: Exclude<GenerationStatus, "pending">;
  usage: ExtractedUsage | null;
  costUsd: number;
  errorCategory?: string | null;
  relatedRecipeId?: string | null;
  relatedMealIdeaId?: string | null;
};

export type InsertMealIdeaInput = MealIdeaPayload & {
  id: string;
  householdId: string;
  weeklyPlanId: string;
  generationId: string;
  createdBy: string;
};

export type CachedResponseRecord = {
  id: string;
  request_hash: string;
  operation_type: string;
  query_normalized: string;
  status: "familiar" | "unfamiliar";
  payload: FullRecipePayload | Record<string, never>;
  generation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetSnapshot = {
  recordedUsageUsd: number;
  ideaCount: number;
  fullRecipeCount: number;
};

export interface GenerateStore {
  getRecordedUsageUsd(): Promise<number>;
  getBudgetSnapshot(): Promise<BudgetSnapshot>;
  countUserRequestsSince(userId: string, since: Date): Promise<number>;
  lastUserRequestAt(userId: string): Promise<Date | null>;
  expireStalePending(
    householdId: string,
    requestHash: string,
    olderThan: Date,
  ): Promise<void>;
  findActiveByHash(
    householdId: string,
    requestHash: string,
  ): Promise<AiGenerationRecord | null>;
  insertPending(input: InsertGenerationInput): Promise<AiGenerationRecord>;
  finishGeneration(input: FinishGenerationInput): Promise<void>;
  listIdeasForPlan(
    householdId: string,
    weeklyPlanId: string,
  ): Promise<MealIdeaRecord[]>;
  listIdeasForGeneration(
    householdId: string,
    generationId: string,
  ): Promise<MealIdeaRecord[]>;
  supersedePendingIdeasForPlan(
    householdId: string,
    weeklyPlanId: string,
  ): Promise<void>;
  getIdea(householdId: string, ideaId: string): Promise<MealIdeaRecord | null>;
  insertIdeas(ideas: InsertMealIdeaInput[]): Promise<MealIdeaRecord[]>;
  commitSuccessfulIdeas(input: {
    generation: FinishGenerationInput;
    ideas: InsertMealIdeaInput[];
  }): Promise<MealIdeaRecord[]>;
  commitSuccessfulRecipe(input: {
    generation: FinishGenerationInput;
    householdId: string;
    mealIdeaId: string;
    recipeId: string;
    payload: FullRecipePayload;
  }): Promise<GeneratedRecipeRecord>;
  updateIdeaStatus(
    householdId: string,
    ideaId: string,
    status: MealIdeaRecord["status"],
    extra?: { replacedByIdeaId?: string | null; recipeId?: string | null },
  ): Promise<MealIdeaRecord | null>;
  getGeneratedRecipe(
    householdId: string,
    mealIdeaId: string,
  ): Promise<GeneratedRecipeRecord | null>;
  upsertGeneratedRecipe(input: {
    householdId: string;
    mealIdeaId: string;
    generationId: string;
    recipeId: string;
    payload: FullRecipePayload;
  }): Promise<GeneratedRecipeRecord>;
  getCachedResponse(requestHash: string): Promise<CachedResponseRecord | null>;
  upsertCachedResponse(input: {
    requestHash: string;
    operationType: string;
    queryNormalized: string;
    status: "familiar" | "unfamiliar";
    payload: FullRecipePayload | Record<string, never>;
    generationId?: string | null;
  }): Promise<CachedResponseRecord>;
}

function isUniqueViolation(err: unknown): boolean {
  const rec =
    err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  if (rec?.code === "23505") return true;
  const cause =
    rec?.cause && typeof rec.cause === "object"
      ? (rec.cause as Record<string, unknown>)
      : null;
  if (cause?.code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /duplicate key|unique constraint/i.test(message);
}

function asNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export const neonGenerateStore: GenerateStore = {
  async getRecordedUsageUsd() {
    const row = await queryOne<{ total: string | number | null }>`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
      FROM ai_usage_ledger
    `;
    return asNumber(row?.total);
  },

  async getBudgetSnapshot() {
    const usage = await queryOne<{ total: string | number | null }>`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
      FROM ai_usage_ledger
    `;
    const ideas = await queryOne<{ count: string | number | null }>`
      SELECT COUNT(*)::int AS count FROM ai_meal_ideas
    `;
    const recipes = await queryOne<{ count: string | number | null }>`
      SELECT COUNT(*)::int AS count FROM ai_generated_recipes
    `;
    return {
      recordedUsageUsd: asNumber(usage?.total),
      ideaCount: asNumber(ideas?.count),
      fullRecipeCount: asNumber(recipes?.count),
    };
  },

  async countUserRequestsSince(userId, since) {
    const row = await queryOne<{ count: string | number | null }>`
      SELECT COUNT(*)::int AS count
      FROM ai_generations
      WHERE requested_by = ${userId}
        AND created_at >= ${since.toISOString()}
        AND operation_type IN (
          'generate_meal_ideas',
          'generate_full_recipe',
          'generate_recipe_from_search'
        )
    `;
    return asNumber(row?.count);
  },

  async lastUserRequestAt(userId) {
    const row = await queryOne<{ created_at: string }>`
      SELECT created_at
      FROM ai_generations
      WHERE requested_by = ${userId}
        AND operation_type IN (
          'generate_meal_ideas',
          'generate_full_recipe',
          'generate_recipe_from_search'
        )
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return row?.created_at ? new Date(row.created_at) : null;
  },

  async expireStalePending(householdId, requestHash, olderThan) {
    await query`
      UPDATE ai_generations
      SET
        output_status = 'error',
        error_category = 'timeout',
        error_details = 'Stale pending generation expired'
      WHERE household_id = ${householdId}
        AND request_hash = ${requestHash}
        AND output_status = 'pending'
        AND created_at < ${olderThan.toISOString()}
    `;
  },

  async findActiveByHash(householdId, requestHash) {
    return queryOne<AiGenerationRecord>`
      SELECT *
      FROM ai_generations
      WHERE household_id = ${householdId}
        AND request_hash = ${requestHash}
        AND output_status IN ('pending', 'success')
      ORDER BY created_at DESC
      LIMIT 1
    `;
  },

  async insertPending(input) {
    try {
      const row = await queryOne<AiGenerationRecord>`
        INSERT INTO ai_generations (
          id, household_id, requested_by, operation_type, related_plan_id,
          related_meal_idea_id, related_week_start, model, input_summary,
          output_status, request_hash
        ) VALUES (
          ${input.id},
          ${input.householdId},
          ${input.userId},
          ${input.operationType},
          ${input.relatedPlanId ?? null},
          ${input.relatedMealIdeaId ?? null},
          ${input.relatedWeekStart ?? null},
          ${input.model},
          ${input.inputSummary},
          'pending',
          ${input.requestHash}
        )
        RETURNING *
      `;
      if (!row) throw new Error("insert pending failed");
      return row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await this.findActiveByHash(
        input.householdId,
        input.requestHash,
      );
      if (existing) return existing;
      throw err;
    }
  },

  async finishGeneration(input) {
    const usage: TokenUsage | null = input.usage
      ? {
          inputTokens: input.usage.inputTokens,
          cachedInputTokens: input.usage.cachedInputTokens,
          outputTokens: input.usage.outputTokens,
        }
      : null;
    const cost = roundUsd(input.costUsd);
    const gen = await queryOne<AiGenerationRecord>`
      SELECT * FROM ai_generations WHERE id = ${input.id} LIMIT 1
    `;
    if (!gen) return;

    const recordLedger =
      input.status === "success" ||
      Boolean(input.usage && !input.usage.missing);

    await withTransaction((txn) => {
      const queries = [
        txn`
          UPDATE ai_generations
          SET
            output_status = ${input.status},
            openai_request_id = ${input.usage?.requestId ?? null},
            input_tokens = ${usage?.inputTokens ?? null},
            cached_input_tokens = ${usage?.cachedInputTokens ?? null},
            output_tokens = ${usage?.outputTokens ?? null},
            estimated_cost_usd = ${input.status === "success" || recordLedger ? cost : null},
            error_category = ${input.errorCategory ?? null},
            related_recipe_id = COALESCE(${input.relatedRecipeId ?? null}, related_recipe_id),
            related_meal_idea_id = COALESCE(${input.relatedMealIdeaId ?? null}, related_meal_idea_id),
            usage_missing = ${input.usage?.missing ?? false},
            token_usage = ${usage ? JSON.stringify(usage) : null}::jsonb
          WHERE id = ${input.id}
        `,
      ];
      if (recordLedger) {
        queries.push(
          txn`
            INSERT INTO ai_usage_ledger (
              household_id, generation_id, operation_type, model,
              input_tokens, cached_input_tokens, output_tokens,
              estimated_cost_usd, usage_missing
            ) VALUES (
              ${gen.household_id},
              ${input.id},
              ${gen.operation_type},
              ${gen.model ?? "gpt-5.4-mini"},
              ${usage?.inputTokens ?? null},
              ${usage?.cachedInputTokens ?? null},
              ${usage?.outputTokens ?? null},
              ${cost},
              ${input.usage?.missing ?? false}
            )
          `,
        );
      }
      return queries;
    });
  },

  async listIdeasForPlan(householdId, weeklyPlanId) {
    return query<MealIdeaRecord>`
      SELECT *
      FROM ai_meal_ideas
      WHERE household_id = ${householdId}
        AND weekly_plan_id = ${weeklyPlanId}
        AND status <> 'replaced'
      ORDER BY created_at ASC
    `;
  },

  async listIdeasForGeneration(householdId, generationId) {
    return query<MealIdeaRecord>`
      SELECT *
      FROM ai_meal_ideas
      WHERE household_id = ${householdId}
        AND generation_id = ${generationId}
        AND status <> 'replaced'
      ORDER BY created_at ASC
    `;
  },

  async supersedePendingIdeasForPlan(householdId, weeklyPlanId) {
    await query`
      UPDATE ai_meal_ideas
      SET status = 'replaced', updated_at = now()
      WHERE household_id = ${householdId}
        AND weekly_plan_id = ${weeklyPlanId}
        AND status = 'pending_review'
    `;
  },

  async getIdea(householdId, ideaId) {
    return queryOne<MealIdeaRecord>`
      SELECT *
      FROM ai_meal_ideas
      WHERE id = ${ideaId} AND household_id = ${householdId}
      LIMIT 1
    `;
  },

  async insertIdeas(ideas) {
    if (!ideas.length) return [];
    const inserted: MealIdeaRecord[] = [];
    for (const idea of ideas) {
      const row = await queryOne<MealIdeaRecord>`
        INSERT INTO ai_meal_ideas (
          id, household_id, weekly_plan_id, generation_id, generated_id,
          name, description, cuisine, prep_time_minutes, cook_time_minutes,
          difficulty, primary_protein, ingredient_preview, applicable_members,
          fit_reason, status, created_by
        ) VALUES (
          ${idea.id},
          ${idea.householdId},
          ${idea.weeklyPlanId},
          ${idea.generationId},
          ${idea.generatedId},
          ${idea.name},
          ${idea.description},
          ${idea.cuisine},
          ${idea.prepTimeMinutes},
          ${idea.cookTimeMinutes},
          ${idea.difficulty},
          ${idea.primaryProtein},
          ${idea.ingredientPreview},
          ${idea.applicableMembers},
          ${idea.fitReason},
          'pending_review',
          ${idea.createdBy}
        )
        RETURNING *
      `;
      if (row) inserted.push(row);
    }
    return inserted;
  },

  async commitSuccessfulIdeas(input) {
    await this.finishGeneration(input.generation);
    return this.insertIdeas(input.ideas);
  },

  async commitSuccessfulRecipe(input) {
    await this.finishGeneration(input.generation);
    const stored = await this.upsertGeneratedRecipe({
      householdId: input.householdId,
      mealIdeaId: input.mealIdeaId,
      generationId: input.generation.id,
      recipeId: input.recipeId,
      payload: input.payload,
    });
    await this.updateIdeaStatus(
      input.householdId,
      input.mealIdeaId,
      "approved",
      {
        recipeId: input.recipeId,
      },
    );
    return stored;
  },

  async updateIdeaStatus(householdId, ideaId, status, extra) {
    return queryOne<MealIdeaRecord>`
      UPDATE ai_meal_ideas
      SET
        status = ${status},
        replaced_by_idea_id = COALESCE(${extra?.replacedByIdeaId ?? null}, replaced_by_idea_id),
        recipe_id = COALESCE(${extra?.recipeId ?? null}, recipe_id)
      WHERE id = ${ideaId} AND household_id = ${householdId}
      RETURNING *
    `;
  },

  async getGeneratedRecipe(householdId, mealIdeaId) {
    const row = await queryOne<
      Omit<GeneratedRecipeRecord, "payload"> & { payload: unknown }
    >`
      SELECT *
      FROM ai_generated_recipes
      WHERE household_id = ${householdId} AND meal_idea_id = ${mealIdeaId}
      LIMIT 1
    `;
    if (!row) return null;
    return { ...row, payload: row.payload as FullRecipePayload };
  },

  async upsertGeneratedRecipe(input) {
    const row = await queryOne<
      Omit<GeneratedRecipeRecord, "payload"> & { payload: unknown }
    >`
      INSERT INTO ai_generated_recipes (
        household_id, meal_idea_id, generation_id, recipe_id, payload
      ) VALUES (
        ${input.householdId},
        ${input.mealIdeaId},
        ${input.generationId},
        ${input.recipeId},
        ${JSON.stringify(input.payload)}::jsonb
      )
      ON CONFLICT (meal_idea_id)
      DO UPDATE SET
        generation_id = EXCLUDED.generation_id,
        recipe_id = EXCLUDED.recipe_id,
        payload = EXCLUDED.payload,
        updated_at = now()
      RETURNING *
    `;
    if (!row) throw new Error("upsert generated recipe failed");
    return { ...row, payload: row.payload as FullRecipePayload };
  },

  async getCachedResponse(requestHash) {
    const row = await queryOne<
      Omit<CachedResponseRecord, "payload"> & { payload: unknown }
    >`
      SELECT *
      FROM ai_response_cache
      WHERE request_hash = ${requestHash}
      LIMIT 1
    `;
    if (!row) return null;
    return {
      ...row,
      payload: row.payload as CachedResponseRecord["payload"],
    };
  },

  async upsertCachedResponse(input) {
    const row = await queryOne<
      Omit<CachedResponseRecord, "payload"> & { payload: unknown }
    >`
      INSERT INTO ai_response_cache (
        request_hash, operation_type, query_normalized, status, payload, generation_id
      ) VALUES (
        ${input.requestHash},
        ${input.operationType},
        ${input.queryNormalized},
        ${input.status},
        ${JSON.stringify(input.payload)}::jsonb,
        ${input.generationId ?? null}
      )
      ON CONFLICT (request_hash)
      DO UPDATE SET
        status = EXCLUDED.status,
        payload = EXCLUDED.payload,
        generation_id = COALESCE(EXCLUDED.generation_id, ai_response_cache.generation_id),
        updated_at = now()
      RETURNING *
    `;
    if (!row) throw new Error("upsert cache failed");
    return {
      ...row,
      payload: row.payload as CachedResponseRecord["payload"],
    };
  },
};

export { estimateCostUsd };
