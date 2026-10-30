import type { TokenUsage } from "@meals/lib/ai/pricing";
import {
  conservativeInputTokensFor,
  maxOutputTokensFor,
  type GenerationOperation,
} from "@meals/lib/ai/limits";

export type ExtractedUsage = TokenUsage & {
  requestId: string | null;
  missing: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Normalize OpenAI Responses or Chat Completions usage.
 * Cached tokens are treated as a subset of input tokens.
 */
export function extractTokenUsage(
  response: unknown,
  operation: GenerationOperation,
): ExtractedUsage {
  const rec = asRecord(response);
  const usage = asRecord(rec?.usage);
  const requestId =
    (typeof rec?.id === "string" && rec.id) ||
    (typeof rec?._request_id === "string" && rec._request_id) ||
    null;

  if (!usage) {
    return {
      inputTokens: conservativeInputTokensFor(operation),
      cachedInputTokens: 0,
      outputTokens: maxOutputTokensFor(operation),
      requestId,
      missing: true,
    };
  }

  const inputTokens = num(usage.input_tokens) || num(usage.prompt_tokens);
  const outputTokens = num(usage.output_tokens) || num(usage.completion_tokens);
  const details =
    asRecord(usage.input_tokens_details) ??
    asRecord(usage.prompt_tokens_details);
  const cachedInputTokens = num(details?.cached_tokens);

  const hasAny = inputTokens > 0 || outputTokens > 0 || cachedInputTokens > 0;
  if (!hasAny) {
    return {
      inputTokens: conservativeInputTokensFor(operation),
      cachedInputTokens: 0,
      outputTokens: maxOutputTokensFor(operation),
      requestId,
      missing: true,
    };
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    requestId,
    missing: false,
  };
}
