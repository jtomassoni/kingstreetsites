#!/usr/bin/env node
/**
 * Apply Meal Planner SQL migrations against MEALS_DATABASE_URL_UNPOOLED
 * (or MEALS_DATABASE_URL). Never targets the CRM DATABASE_URL unless
 * MEALS_USE_DATABASE_URL=1 is set explicitly.
 *
 * Non-destructive: runs migration files in order; does not reset/seed.
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv(path.join(root, ".env"));
loadDotEnv(path.join(root, ".env.local"));

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
