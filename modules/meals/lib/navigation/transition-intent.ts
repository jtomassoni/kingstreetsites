export type TransitionIntent =
  | "fade"
  | "week-next"
  | "week-prev"
  | "week-jump";

const INTENT_KEY = "mealplan-nav-intent";

export function setTransitionIntent(intent: TransitionIntent) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INTENT_KEY, intent);
  } catch {
    // ignore quota / private mode
  }
}

export function consumeTransitionIntent(): TransitionIntent {
  if (typeof window === "undefined") return "fade";
  try {
    const value = sessionStorage.getItem(INTENT_KEY);
    sessionStorage.removeItem(INTENT_KEY);
    if (
      value === "fade" ||
      value === "week-next" ||
      value === "week-prev" ||
      value === "week-jump"
    ) {
      return value;
    }
  } catch {
    // ignore
  }
  return "fade";
}

export function weekTransitionIntent(
  fromWeekStart: string,
  toWeekStart: string,
): TransitionIntent {
  if (toWeekStart > fromWeekStart) return "week-next";
  if (toWeekStart < fromWeekStart) return "week-prev";
  return "week-jump";
}
