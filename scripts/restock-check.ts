/**
 * Run Restock Tracker checks from this Mac (headed Chrome for GameStop,
 * Best Buy API when BESTBUY_API_KEY is set). Writes to the meals Neon
 * database, so the production dashboard updates even when Vercel cannot
 * reach GameStop.
 *
 *   npm run restock:check
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAllHouseholdChecks } from "@restock/lib/runner";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(filePath: string) {
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

async function main() {
  const result = await runAllHouseholdChecks({ ignoreBackoff: true });
  const lines: string[] = [
    `households=${result.households} ran=${result.ran} skipped=${result.skipped}`,
  ];
  for (const summary of result.summaries) {
    if (!summary.ran) {
      lines.push(`  household skipped: ${summary.skippedReason ?? "unknown"}`);
      continue;
    }
    for (const product of summary.results) {
      lines.push(
        `  ${product.retailer} ${product.status}${product.method ? `/${product.method}` : ""} stores=${product.storeCount} available=${product.availableCount}${product.error ? ` — ${product.error}` : ""}`,
      );
    }
  }
  console.log(lines.join("\n"));
  if (result.summaries.some((s) => s.ran && !s.success)) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    // CDP keep-alive holds the event loop; the dedicated Chrome stays running.
    process.exit(process.exitCode ?? 0);
  });
