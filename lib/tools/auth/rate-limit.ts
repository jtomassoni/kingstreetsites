/**
 * In-memory login attempt limiter (per process).
 * Protects against casual credential stuffing; not a distributed rate limiter.
 */

type Bucket = { count: number; resetAt: number };

const attempts = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function loginRateLimitKey(ip: string, email: string): string {
  return `${ip}::${email.trim().toLowerCase()}`;
}

export function checkLoginRateLimit(key: string): {
  ok: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true };
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
