import type { CheckStatus } from "@restock/types";

/** Cron cadence in vercel.json. */
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** A run holding the lock longer than this is considered dead. */
export const RUN_LOCK_TTL_MS = 4 * 60 * 1000;
/** Minimum spacing between manual "Check now" clicks. */
export const MANUAL_CHECK_MIN_INTERVAL_MS = 60 * 1000;
/** Per-retailer HTTP timeout. */
export const REQUEST_TIMEOUT_MS = 20 * 1000;
/** Whole browser session budget (launch + navigate + fetch). */
export const BROWSER_BUDGET_MS = 60 * 1000;
/** Max delivery attempts for a single alert before it is marked failed for good. */
export const MAX_ALERT_ATTEMPTS = 6;

const MAX_BACKOFF_MS = 60 * 60 * 1000;

/**
 * Exponential backoff after consecutive failures. Blocked/rate-limited
 * responses back off harder than plain errors so we do not hammer a WAF.
 * Returns null when no backoff is needed.
 */
export function backoffAfterFailure(
  consecutiveFailures: number,
  worstStatus: CheckStatus,
): number | null {
  if (consecutiveFailures <= 0) return null;
  const base = worstStatus === "blocked" ? 15 * 60 * 1000 : CHECK_INTERVAL_MS;
  // First failure: skip nothing for plain errors (next cron tick retries);
  // first block: 15 min. Then double.
  const exponent = Math.max(0, consecutiveFailures - 1);
  const ms = Math.min(MAX_BACKOFF_MS, base * 2 ** exponent);
  if (worstStatus !== "blocked" && consecutiveFailures === 1) return null;
  return ms;
}

/** Delay before retrying a failed alert delivery. */
export function alertRetryDelayMs(attempts: number): number {
  const schedule = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];
  return schedule[Math.min(Math.max(attempts - 1, 0), schedule.length - 1)];
}

/** Next queue state after a failed send. Sent alerts are never passed in. */
export function planDeliveryRetry(attemptsIncludingThis: number): {
  status: "pending" | "failed";
  delayMs: number;
} {
  const exhausted = attemptsIncludingThis >= MAX_ALERT_ATTEMPTS;
  return {
    status: exhausted ? "failed" : "pending",
    delayMs: alertRetryDelayMs(attemptsIncludingThis),
  };
}

export function deliveryDecision(alert: {
  status: "pending" | "sent" | "failed";
  recipients: string[];
}): "already_sent" | "no_recipients" | "send" {
  if (alert.status === "sent") return "already_sent";
  if (alert.recipients.length === 0) return "no_recipients";
  return "send";
}

export function isBackedOff(backoffUntil: string | null, now: Date): boolean {
  if (!backoffUntil) return false;
  const t = Date.parse(backoffUntil);
  return Number.isFinite(t) && t > now.getTime();
}

export function manualCheckAllowed(
  lastManualCheckAt: string | null,
  now: Date,
): { ok: boolean; retryAfterSeconds?: number } {
  if (!lastManualCheckAt) return { ok: true };
  const last = Date.parse(lastManualCheckAt);
  if (!Number.isFinite(last)) return { ok: true };
  const elapsed = now.getTime() - last;
  if (elapsed >= MANUAL_CHECK_MIN_INTERVAL_MS) return { ok: true };
  return {
    ok: false,
    retryAfterSeconds: Math.ceil((MANUAL_CHECK_MIN_INTERVAL_MS - elapsed) / 1000),
  };
}

/** Rank statuses so a run's "worst" outcome can drive backoff. */
const STATUS_SEVERITY: Record<CheckStatus, number> = {
  ok: 0,
  skipped: 0,
  degraded: 1,
  malformed: 2,
  error: 3,
  blocked: 4,
};

export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  let worst: CheckStatus = "ok";
  for (const s of statuses) {
    if (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst]) worst = s;
  }
  return worst;
}

/** True when at least one provider produced a trustworthy result. */
export function runSucceeded(statuses: CheckStatus[]): boolean {
  return statuses.some((s) => s === "ok");
}

/**
 * Cron authorization: Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * Fails closed when CRON_SECRET is not configured.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
): boolean {
  const secret = cronSecret?.trim();
  if (!secret || secret.length < 16) return false;
  if (!authorizationHeader) return false;
  const expected = `Bearer ${secret}`;
  if (authorizationHeader.length !== expected.length) return false;
  // Constant-time-ish comparison without Node crypto (edge-safe).
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= authorizationHeader.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
