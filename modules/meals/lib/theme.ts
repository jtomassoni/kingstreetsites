export const THEME_STORAGE_KEY = "mealplan-theme";
export const THEME_ROOT_SELECTOR = ".tools-meals";

export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(stored: Theme | null = readStoredTheme()): Theme {
  return stored ?? systemTheme();
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const roots = document.querySelectorAll(THEME_ROOT_SELECTOR);
  roots.forEach((el) => {
    (el as HTMLElement).dataset.theme = theme;
    (el as HTMLElement).style.colorScheme = theme;
  });
}

export function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode / blocked storage — theme still applies for this session
  }
  applyTheme(theme);
}
