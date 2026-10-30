/**
 * Centralized OpenAI pricing for this app.
 * Changing models requires updating and verifying these figures
 * against https://openai.com/api/pricing before generating again.
 */
export const OPENAI_RECIPE_MODEL = "gpt-5.4-mini" as const;

export const OPENAI_MODEL_PRICING = {
  model: OPENAI_RECIPE_MODEL,
  inputUsdPerMillion: 0.75,
  cachedInputUsdPerMillion: 0.075,
  outputUsdPerMillion: 4.5,
} as const;

export type OpenAiModelPricing = {
  model: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

/**
 * Estimate USD cost from token usage.
 *
 * OpenAI reports cached tokens as a subset of input tokens. Cached tokens
 * are charged at the cached rate only — they are subtracted from input
 * before applying the regular input price.
 */
export function estimateCostUsd(
  usage: TokenUsage,
  pricing: OpenAiModelPricing = OPENAI_MODEL_PRICING,
): number {
  const inputTokens = Math.max(0, usage.inputTokens);
  const cachedInputTokens = Math.min(
    Math.max(0, usage.cachedInputTokens),
    inputTokens,
  );
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const outputTokens = Math.max(0, usage.outputTokens);

  return (
    (uncachedInputTokens * pricing.inputUsdPerMillion) / 1_000_000 +
    (cachedInputTokens * pricing.cachedInputUsdPerMillion) / 1_000_000 +
    (outputTokens * pricing.outputUsdPerMillion) / 1_000_000
  );
}

export function roundUsd(value: number, digits = 8): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
