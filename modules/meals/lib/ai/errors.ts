export type AiErrorKind =
  | "billing"
  | "rate_limit"
  | "auth"
  | "network"
  | "not_configured"
  | "validation"
  | "budget"
  | "daily_limit"
  | "cooldown"
  | "timeout"
  | "unfamiliar"
  | "unknown";

export type ClassifiedAiError = {
  kind: AiErrorKind;
  /** Short label for UI chips / toasts */
  title: string;
  /** User-facing explanation */
  message: string;
  /** Raw detail (safe to show in a log; no secrets) */
  detail?: string;
};

function asRecord(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null;
  return err as Record<string, unknown>;
}

function collectText(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) parts.push(err.message);
  else if (typeof err === "string") parts.push(err);

  const obj = asRecord(err);
  if (obj) {
    for (const key of ["code", "type", "status", "message", "error"] as const) {
      const v = obj[key];
      if (typeof v === "string" || typeof v === "number") parts.push(String(v));
      if (v && typeof v === "object") {
        const nested = v as Record<string, unknown>;
        if (typeof nested.message === "string") parts.push(nested.message);
        if (typeof nested.code === "string") parts.push(nested.code);
        if (typeof nested.type === "string") parts.push(nested.type);
      }
    }
    const cause = obj.cause;
    if (cause instanceof Error) parts.push(cause.message);
  }
  return parts.join(" ").toLowerCase();
}

function statusOf(err: unknown): number | null {
  const obj = asRecord(err);
  if (!obj) return null;
  if (typeof obj.status === "number") return obj.status;
  if (typeof obj.statusCode === "number") return obj.statusCode;
  return null;
}

/** Map OpenAI / network failures into clear Ideas-page copy. */
export function classifyAiError(err: unknown): ClassifiedAiError {
  const text = collectText(err);
  const status = statusOf(err);
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : undefined;

  if (
    text.includes("openai_api_key") ||
    text.includes("ai features are disabled") ||
    text.includes("ai is not configured") ||
    (text.includes("missing") && text.includes("api"))
  ) {
    return {
      kind: "not_configured",
      title: "AI not configured",
      message:
        "OpenAI isn’t set up. Add OPENAI_API_KEY in .env.local (or turn AI off and we’ll use a stub recipe).",
      detail,
    };
  }

  if (
    text.includes("internal budget") ||
    text.includes("ai budget") ||
    text.includes("lifetime budget")
  ) {
    return {
      kind: "budget",
      title: "Budget reached",
      message:
        "The household AI budget has been reached, so new generations are paused.",
      detail,
    };
  }

  if (text.includes("daily generation limit") || text.includes("daily_limit")) {
    return {
      kind: "daily_limit",
      title: "Daily limit",
      message:
        "This account has reached today’s generation limit. Try again tomorrow.",
      detail,
    };
  }

  if (text.includes("wait a few seconds") || text.includes("cooldown")) {
    return {
      kind: "cooldown",
      title: "Slow down",
      message: "Please wait a few seconds before generating again.",
      detail,
    };
  }

  if (
    text.includes("not something we’re familiar") ||
    text.includes("not something we're familiar") ||
    text.includes("unfamiliar")
  ) {
    return {
      kind: "unfamiliar",
      title: "Not a dish we know",
      message: "That’s not something we’re familiar with.",
      detail,
    };
  }

  if (
    text.includes("insufficient_quota") ||
    text.includes("billing") ||
    text.includes("payment") ||
    text.includes("exceeded your current quota") ||
    text.includes("credit balance") ||
    text.includes("account is not active") ||
    status === 402
  ) {
    return {
      kind: "billing",
      title: "Billing / quota",
      message:
        "OpenAI rejected the request for billing or quota reasons. Check billing and usage at platform.openai.com, then try again.",
      detail,
    };
  }

  if (
    text.includes("rate_limit") ||
    text.includes("too many requests") ||
    status === 429
  ) {
    return {
      kind: "rate_limit",
      title: "Rate limited",
      message:
        "OpenAI is rate-limiting this key right now. Wait a moment and try again.",
      detail,
    };
  }

  if (
    text.includes("incorrect api key") ||
    text.includes("invalid_api_key") ||
    text.includes("authentication") ||
    text.includes("unauthorized") ||
    status === 401 ||
    status === 403
  ) {
    return {
      kind: "auth",
      title: "API key problem",
      message:
        "OpenAI didn’t accept the API key. Confirm OPENAI_API_KEY in .env.local and restart the dev server.",
      detail,
    };
  }

  if (text.includes("failed validation") || text.includes("validation")) {
    return {
      kind: "validation",
      title: "Bad AI response",
      message:
        "The model returned a recipe we couldn’t use. Try again with a clearer dish name.",
      detail,
    };
  }

  if (
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("econnreset") ||
    text.includes("enotfound") ||
    text.includes("etimedout") ||
    text.includes("timeout") ||
    text.includes("socket") ||
    text.includes("offline") ||
    text.includes("dns") ||
    text.includes("certificate") ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return {
      kind: "network",
      title: "Network issue",
      message:
        "Couldn’t reach OpenAI (network or connectivity). Check your connection and try again.",
      detail,
    };
  }

  return {
    kind: "unknown",
    title: "AI request failed",
    message:
      detail && detail.length < 180
        ? detail
        : "Something went wrong talking to OpenAI. Try again in a moment.",
    detail,
  };
}

export function formatAiErrorMessage(err: unknown): string {
  const c = classifyAiError(err);
  return `${c.title}: ${c.message}`;
}
