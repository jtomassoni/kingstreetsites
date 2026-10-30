import OpenAI, {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "openai";
import { generationError } from "@meals/lib/ai/generation-error";
import { AI_LIMITS, type GenerationOperation } from "@meals/lib/ai/limits";
import { OPENAI_RECIPE_MODEL } from "@meals/lib/ai/pricing";
import { extractTokenUsage, type ExtractedUsage } from "@meals/lib/ai/usage";

export type StructuredOpenAiRequest = {
  operation: GenerationOperation;
  systemPrompt: string;
  userPayload: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
};

export type StructuredOpenAiResult = {
  parsedJson: unknown;
  usage: ExtractedUsage;
  model: string;
};

export type StructuredOpenAiCaller = (
  request: StructuredOpenAiRequest,
) => Promise<StructuredOpenAiResult>;

function isTransientServerError(err: unknown): boolean {
  if (err instanceof InternalServerError) return true;
  if (err instanceof APIConnectionTimeoutError) return false;
  if (err instanceof APIError) {
    return err.status === 500 || err.status === 502 || err.status === 503;
  }
  return false;
}

function mapOpenAiError(err: unknown): never {
  if (err instanceof AuthenticationError) {
    throw generationError("unauthorized");
  }
  if (err instanceof RateLimitError) {
    const text = err.message.toLowerCase();
    if (
      text.includes("insufficient_quota") ||
      text.includes("billing") ||
      text.includes("quota")
    ) {
      throw generationError("billing");
    }
    throw generationError("rate_limit");
  }
  if (err instanceof APIConnectionTimeoutError) {
    throw generationError("timeout");
  }
  if (err instanceof APIError) {
    const text =
      `${err.message} ${err.code ?? ""} ${err.type ?? ""}`.toLowerCase();
    if (err.status === 401 || err.status === 403) {
      throw generationError("unauthorized");
    }
    if (
      err.status === 402 ||
      text.includes("insufficient_quota") ||
      text.includes("billing")
    ) {
      throw generationError("billing");
    }
    if (err.status === 429) throw generationError("rate_limit");
    if (err.status === 408) throw generationError("timeout");
  }
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("timed out")) {
    throw generationError("timeout");
  }
  throw generationError("unknown");
}

function extractOutputText(response: OpenAI.Responses.Response): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) chunks.push(part.text);
    }
  }
  return chunks.join("");
}

export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    timeout: AI_LIMITS.requestTimeoutMs,
    maxRetries: 0,
  });
}

export function createStructuredCaller(client: OpenAI): StructuredOpenAiCaller {
  return async function callStructured(
    request: StructuredOpenAiRequest,
  ): Promise<StructuredOpenAiResult> {
    const run = () =>
      client.responses.create({
        model: OPENAI_RECIPE_MODEL,
        reasoning: { effort: "none" },
        max_output_tokens: request.maxOutputTokens,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.jsonSchema,
          },
        },
        input: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPayload },
        ],
      });

    let response: OpenAI.Responses.Response;
    try {
      try {
        response = await run();
      } catch (err) {
        if (!isTransientServerError(err)) mapOpenAiError(err);
        response = await run();
      }
    } catch (err) {
      mapOpenAiError(err);
    }

    const text = extractOutputText(response);
    let parsedJson: unknown = {};
    try {
      parsedJson = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      throw generationError("invalid_response");
    }

    return {
      parsedJson,
      usage: extractTokenUsage(response, request.operation),
      model: response.model || OPENAI_RECIPE_MODEL,
    };
  };
}
