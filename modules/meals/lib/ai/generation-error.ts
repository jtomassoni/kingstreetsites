export type GenerationErrorCode =
  | "not_configured"
  | "unauthenticated"
  | "unauthorized"
  | "daily_limit"
  | "budget"
  | "cooldown"
  | "billing"
  | "rate_limit"
  | "invalid_response"
  | "timeout"
  | "database"
  | "in_progress"
  | "not_found"
  | "unfamiliar"
  | "unknown";

export class GenerationError extends Error {
  readonly code: GenerationErrorCode;

  constructor(code: GenerationErrorCode, message: string) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
  }
}

export const GENERATION_ERROR_MESSAGES: Record<GenerationErrorCode, string> = {
  not_configured:
    "AI isn’t set up yet. Add OPENAI_API_KEY on the server and try again.",
  unauthenticated: "You need to sign in before generating meals.",
  unauthorized:
    "Your account isn’t allowed to generate meals for this household.",
  daily_limit:
    "This account has reached today’s generation limit. Try again tomorrow.",
  budget:
    "The household AI budget has been reached, so new generations are paused.",
  cooldown: "Please wait a few seconds before generating again.",
  billing:
    "OpenAI rejected this request for billing or quota reasons. Check the OpenAI dashboard.",
  rate_limit: "OpenAI is busy right now. Wait a moment and try once more.",
  invalid_response:
    "The model returned something we couldn’t use. Nothing was saved. Try again with clearer notes.",
  timeout:
    "The request took too long and was stopped. Nothing extra was billed beyond any partial usage.",
  database: "Couldn’t save the result. Try again in a moment.",
  in_progress:
    "That same request is already running. Hang tight rather than sending another.",
  not_found: "That meal idea wasn’t found.",
  unfamiliar: "That’s not something we’re familiar with.",
  unknown: "Something went wrong generating that. Try again in a moment.",
};

export function generationError(
  code: GenerationErrorCode,
  message?: string,
): GenerationError {
  return new GenerationError(code, message ?? GENERATION_ERROR_MESSAGES[code]);
}

export function toGenerationErrorPayload(err: unknown): {
  error: string;
  errorCode: GenerationErrorCode;
} {
  if (err instanceof GenerationError) {
    return { error: err.message, errorCode: err.code };
  }
  return {
    error: GENERATION_ERROR_MESSAGES.unknown,
    errorCode: "unknown",
  };
}
