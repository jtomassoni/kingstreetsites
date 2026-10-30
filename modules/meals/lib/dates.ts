/** Coerce Neon/pg Date or string values to YYYY-MM-DD. */
export function toDateOnlyString(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return String(value ?? "").slice(0, 10);
}

/** Coerce Date/string timestamps to ISO strings for JSON/UI. */
export function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return String(value);
}
