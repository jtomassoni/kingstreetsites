import { Pool } from "pg";

const globalForDb = globalThis as unknown as { appDbPool?: Pool };

export const dbPool =
  globalForDb.appDbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.appDbPool = dbPool;
}
