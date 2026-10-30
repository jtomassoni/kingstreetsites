/** Normalize a search/idea string for cache keys and drink checks. */
export function normalizeQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripLeadingArticles(normalized: string): string {
  return normalized.replace(/^(a|an|the)\s+/, "").trim();
}
