#!/usr/bin/env node
/**
 * Load .env from repo root and run psql against DATABASE_URL.
 * Usage: node scripts/psql-with-env.mjs <path-to.sql>
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");

function loadDotEnv(path) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}`);
    process.exit(1);
  }
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
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

loadDotEnv(envPath);
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

const sqlFile = resolve(root, process.argv[2] || "lib/db-migrate-scrape-analyze.sql");
if (!existsSync(sqlFile)) {
  console.error(`SQL file not found: ${sqlFile}`);
  process.exit(1);
}

const r = spawnSync("psql", [dbUrl, "-f", sqlFile], {
  stdio: "inherit",
  cwd: root,
});
process.exit(r.status === null ? 1 : r.status);
