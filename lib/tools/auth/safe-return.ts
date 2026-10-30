/**
 * Only allow same-origin relative redirects back into /tools/*.
 */
export function safeToolsReturnPath(
  raw: string | null | undefined,
  fallback = "/tools",
): string {
  if (!raw) return fallback;
  let value = raw.trim();
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      value = `${url.pathname}${url.search}`;
    }
  } catch {
    return fallback;
  }
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (!value.startsWith("/tools")) return fallback;
  if (value.startsWith("/tools/login")) return fallback;
  return value;
}
