import {
  neon,
  type NeonQueryFunction,
  type NeonQueryFunctionInTransaction,
  type NeonQueryInTransaction,
} from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

const CONNECT_RETRY_DELAYS_MS = [400, 1200];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const extras: string[] = [];
  const source = (err as Error & { sourceError?: unknown }).sourceError;
  if (source instanceof Error) extras.push(source.message);
  let cause: unknown = source instanceof Error ? source.cause : err.cause;
  for (let i = 0; i < 4 && cause; i++) {
    if (cause instanceof Error) {
      extras.push(cause.message);
      cause = cause.cause;
    } else {
      extras.push(String(cause));
      break;
    }
  }
  return [err.message, ...extras].join(" ");
}

function isTransientConnectError(err: unknown): boolean {
  const text = errorText(err).toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("failed to fetch") ||
    text.includes("error connecting to database") ||
    text.includes("couldn't connect to compute") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("socket hang up") ||
    text.includes("network")
  );
}

async function withConnectRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!isTransientConnectError(err)) throw err;
    for (const delay of CONNECT_RETRY_DELAYS_MS) {
      await sleep(delay);
      sql = null;
      try {
        return await op();
      } catch (retryErr) {
        err = retryErr;
        if (!isTransientConnectError(retryErr)) throw retryErr;
      }
    }
    throw err;
  }
}

function resolveDatabaseUrl(): string | undefined {
  const dedicated = process.env.MEALS_DATABASE_URL?.trim();
  if (dedicated) return dedicated;
  if (process.env.MEALS_USE_DATABASE_URL === "1") {
    return process.env.DATABASE_URL?.trim() || undefined;
  }
  return undefined;
}

export function getSql() {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      "MEALS_DATABASE_URL is not set (meal planner Neon URL; do not reuse the CRM DATABASE_URL unless MEALS_USE_DATABASE_URL=1)",
    );
  }
  if (!sql) {
    // Next.js patches global fetch and may cache/instrument it. Neon queries
    // are HTTP POSTs and must not go through the data cache.
    sql = neon(url, { fetchOptions: { cache: "no-store" } });
  }
  return sql;
}

/**
 * Neon/pg may return DATE/timestamptz as Date objects or ISO strings.
 * The app expects YYYY-MM-DD for date columns and ISO strings for timestamps.
 */
function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    const iso = value.toISOString();
    if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
    return iso;
  }
  if (typeof value === "string") {
    // DATE columns sometimes arrive as full midnight ISO strings.
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?(Z|[+-]00:00)?$/.test(value)) {
      return value.slice(0, 10);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return normalizeRow(value as Record<string, unknown>);
  }
  return value;
}

function normalizeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = normalizeValue(value);
  }
  return out as T;
}

/** Run a parameterized query; returns rows as objects. */
export async function query<
  T extends Record<string, unknown> = Record<string, unknown>,
>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  const rows = await withConnectRetry(() => getSql()(strings, ...values));
  return (rows as T[]).map((row) => normalizeRow(row));
}

export async function queryOne<
  T extends Record<string, unknown> = Record<string, unknown>,
>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T | null> {
  const rows = await query<T>(strings, ...values);
  return rows[0] ?? null;
}

/** Neon HTTP transaction: all queries are submitted together (non-interactive). */
export async function withTransaction<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  build: (
    txn: NeonQueryFunctionInTransaction<false, false>,
  ) => NeonQueryInTransaction[],
): Promise<T[][]> {
  const rows = await withConnectRetry(() =>
    getSql().transaction((txn) => build(txn)),
  );
  return (rows as T[][]).map((set) => set.map((row) => normalizeRow(row)));
}
