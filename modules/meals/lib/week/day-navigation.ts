import { format } from "date-fns";
import { toDateOnlyString } from "@meals/lib/dates";
import {
  adjacentWeekInWindow,
  getWeekDays,
  parseWeekStart,
} from "@meals/lib/week/dates";

type DayLike = { id: string; day_date: string | Date };

export type AdjacentDayNavigation =
  | { kind: "same-week"; dayId: string; date: string }
  | { kind: "cross-week"; weekStart: string; date: string };

export function resolveAdjacentDayNavigation(input: {
  weekStart: string;
  sortedDays: DayLike[];
  activeDate: string;
  delta: -1 | 1;
}): AdjacentDayNavigation | null {
  const dayDates = input.sortedDays.map((day) =>
    toDateOnlyString(day.day_date),
  );
  const index = dayDates.indexOf(input.activeDate);
  if (index < 0) return null;

  const nextIndex = index + input.delta;
  if (nextIndex >= 0 && nextIndex < dayDates.length) {
    const nextDate = dayDates[nextIndex]!;
    const nextDay = input.sortedDays.find(
      (day) => toDateOnlyString(day.day_date) === nextDate,
    );
    if (!nextDay) return null;
    return { kind: "same-week", dayId: nextDay.id, date: nextDate };
  }

  const adjacentWeek = adjacentWeekInWindow(input.weekStart, input.delta);
  if (!adjacentWeek) return null;

  const adjacentDays = getWeekDays(parseWeekStart(adjacentWeek)).map((day) =>
    format(day, "yyyy-MM-dd"),
  );
  const targetDate =
    input.delta === 1 ? adjacentDays[0]! : adjacentDays[adjacentDays.length - 1]!;

  return { kind: "cross-week", weekStart: adjacentWeek, date: targetDate };
}

export function canNavigateDay(input: {
  weekStart: string;
  sortedDays: DayLike[];
  activeDate: string;
  delta: -1 | 1;
}): boolean {
  return resolveAdjacentDayNavigation(input) !== null;
}
