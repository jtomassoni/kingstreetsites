export const MAX_RECIPE_PASTE_CHARS = 12_000;
export const MIN_RECIPE_PASTE_CHARS = 20;
export const MIN_RECIPE_FEEDBACK_CHARS = 8;
const URL_ONLY = /^https?:\/\/\S+$/i;

/** Client-safe checks before we send pasted text to OpenAI. */
export function validateRecipePaste(
  text: string,
  options?: { revising?: boolean },
): string | null {
  const trimmed = text.trim();
  const minChars = options?.revising
    ? MIN_RECIPE_FEEDBACK_CHARS
    : MIN_RECIPE_PASTE_CHARS;
  if (trimmed.length < minChars) {
    return options?.revising
      ? "Add a bit more about what should change."
      : "Paste more of the recipe — ingredients and steps help.";
  }
  if (trimmed.length > MAX_RECIPE_PASTE_CHARS) {
    return `Paste is too long (max ${MAX_RECIPE_PASTE_CHARS.toLocaleString()} characters).`;
  }
  if (URL_ONLY.test(trimmed)) {
    return "Paste the recipe text, not just a link. We don’t fetch websites.";
  }
  return null;
}
