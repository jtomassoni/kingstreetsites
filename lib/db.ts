import { Pool } from "pg";

const globalForDb = globalThis as unknown as { appDbPool?: Pool };

export function getDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  const trimmed = url?.trim();
  return trimmed || undefined;
}

function createPool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return new Pool({ connectionString });
}

/** Shared pool for Neon — reuse across requests; do not call pool.end(). */
export function getDbPool(): Pool {
  if (!globalForDb.appDbPool) {
    globalForDb.appDbPool = createPool();
  }
  return globalForDb.appDbPool;
}

export const dbPool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const pool = getDbPool();
    const value = pool[prop as keyof Pool];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(pool) : value;
  },
});
