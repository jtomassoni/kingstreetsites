#!/usr/bin/env node
/**
 * Apply Meal Planner SQL migrations against MEALS_DATABASE_URL_UNPOOLED
 * (or MEALS_DATABASE_URL). Never targets the CRM DATABASE_URL unless
 * MEALS_USE_DATABASE_URL=1 is set explicitly.
 *
 * Non-destructive: runs migration files in order; does not reset/seed.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const url =
  process.env.MEALS_DATABASE_URL_UNPOOLED?.trim() ||
  process.env.MEALS_DATABASE_URL?.trim() ||
  (process.env.MEALS_USE_DATABASE_URL === "1"
    ? process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
    : undefined);

if (!url) {
  console.error(
    "Set MEALS_DATABASE_URL_UNPOOLED (or MEALS_DATABASE_URL) before migrating.",
  );
  process.exit(1);
}

const dir = path.join(process.cwd(), "db/meals/migrations");
const files = (await readdir(dir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const file of files) {
    const id = file;
    const existing = await client.query(
      "SELECT 1 FROM schema_migrations WHERE id = $1",
      [id],
    );
    if (existing.rowCount) {
      console.log(`skip ${id}`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    console.log(`apply ${id}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  console.log("Meals migrations complete.");
} finally {
  await client.end();
}
