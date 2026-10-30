import {
  estimateCostUsd,
  type OpenAiModelPricing,
  OPENAI_MODEL_PRICING,
} from "@meals/lib/ai/pricing";
import {
  conservativeInputTokensFor,
  maxOutputTokensFor,
  type GenerationOperation,
} from "@meals/lib/ai/limits";

export const DEFAULT_LIFETIME_BUDGET_USD = 20;
export const DEFAULT_INTERNAL_STOP_USD = 18;
/** Legacy config default; not enforced in-app (OpenAI billing is the backstop). */
export const DEFAULT_MAX_REQUESTS_PER_USER_PER_DAY = 50;

export type BudgetConfig = {
  lifetimeBudgetUsd: number;
  internalStopUsd: number;
  maxRequestsPerUserPerDay: number;
};

export function parseBudgetConfig(env: {
  OPENAI_LIFETIME_BUDGET_USD?: string;
  OPENAI_INTERNAL_STOP_USD?: string;
  OPENAI_MAX_REQUESTS_PER_USER_PER_DAY?: string;
}): BudgetConfig {
  return {
    lifetimeBudgetUsd: parsePositiveNumber(
      env.OPENAI_LIFETIME_BUDGET_USD,
      DEFAULT_LIFETIME_BUDGET_USD,
    ),
    internalStopUsd: parsePositiveNumber(
      env.OPENAI_INTERNAL_STOP_USD,
      DEFAULT_INTERNAL_STOP_USD,
    ),
    maxRequestsPerUserPerDay: Math.floor(
      parsePositiveNumber(
        env.OPENAI_MAX_REQUESTS_PER_USER_PER_DAY,
        DEFAULT_MAX_REQUESTS_PER_USER_PER_DAY,
      ),
    ),
  };
}

function parsePositiveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  const n = raw?.trim() ? Number(raw) : fallback;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Worst-case cost assuming no cached input tokens. */
export function estimateMaxRequestCostUsd(
  operation: GenerationOperation,
  pricing: OpenAiModelPricing = OPENAI_MODEL_PRICING,
): number {
  return estimateCostUsd(
    {
      inputTokens: conservativeInputTokensFor(operation),
      cachedInputTokens: 0,
      outputTokens: maxOutputTokensFor(operation),
    },
    pricing,
  );
}

export function wouldExceedInternalStop(input: {
  recordedUsageUsd: number;
  proposedMaxCostUsd: number;
  internalStopUsd: number;
}): boolean {
  return (
    input.recordedUsageUsd + input.proposedMaxCostUsd > input.internalStopUsd
  );
}

export function remainingBudgetUsd(input: {
  recordedUsageUsd: number;
  lifetimeBudgetUsd: number;
}): number {
  return Math.max(0, input.lifetimeBudgetUsd - input.recordedUsageUsd);
}

export function isDailyLimitReached(
  requestsToday: number,
  maxRequestsPerUserPerDay: number,
): boolean {
  return requestsToday >= maxRequestsPerUserPerDay;
}

export function isCooldownActive(input: {
  lastRequestAt: Date | string | null;
  now: Date;
  cooldownMs: number;
}): boolean {
  if (!input.lastRequestAt) return false;
  const last =
    input.lastRequestAt instanceof Date
      ? input.lastRequestAt
      : new Date(input.lastRequestAt);
  if (Number.isNaN(last.getTime())) return false;
  return input.now.getTime() - last.getTime() < input.cooldownMs;
}

export function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
