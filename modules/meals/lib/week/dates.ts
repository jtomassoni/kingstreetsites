import {
  addWeeks as dateFnsAddWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function formatWeekStart(date: Date): string {
  return format(getWeekStart(date), "yyyy-MM-dd");
}

export function parseWeekStart(s: string): Date {
  return getWeekStart(parseISO(s));
}

export function getWeekDays(weekStart: Date): Date[] {
  const start = getWeekStart(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function addWeeks(weekStart: Date, n: number): Date {
  return dateFnsAddWeeks(getWeekStart(weekStart), n);
}

/** Planning window: this week through the week containing (now + 1 year). */
export function getPlanningBounds(now = new Date()): {
  min: string;
  current: string;
  max: string;
} {
  const thisWeek = getWeekStart(now);
  return {
    min: formatWeekStart(thisWeek),
    current: formatWeekStart(thisWeek),
    max: formatWeekStart(addYears(now, 1)),
  };
}

export function isInPlanningWindow(weekStart: string, now = new Date()): boolean {
  const { min, max } = getPlanningBounds(now);
  const target = formatWeekStart(parseWeekStart(weekStart));
  return target >= min && target <= max;
}

export function clampToPlanningWindow(weekStart: string, now = new Date()): string {
  const { min, max } = getPlanningBounds(now);
  const target = formatWeekStart(parseWeekStart(weekStart));
  if (target < min) return min;
  if (target > max) return max;
  return target;
}

/** Adjacent week within the planning window, or null if out of bounds. */
export function adjacentWeekInWindow(
  weekStart: string,
  deltaWeeks: number,
  now = new Date(),
): string | null {
  const next = formatWeekStart(addWeeks(parseWeekStart(weekStart), deltaWeeks));
  return isInPlanningWindow(next, now) ? next : null;
}

export function getWeekTitle(weekStart: string, now = new Date()): string {
  const { current } = getPlanningBounds(now);
  const target = formatWeekStart(parseWeekStart(weekStart));
  if (target === current) return "This week";
  const next = formatWeekStart(addWeeks(parseWeekStart(current), 1));
  if (target === next) return "Next week";
  return `Week of ${format(parseWeekStart(target), "MMM d")}`;
}

export type MonthWeekGlance = {
  weekStart: string;
  label: string;
  rangeLabel: string;
  inPlanningWindow: boolean;
  isCurrent: boolean;
};

/** Mondays for weeks that intersect the calendar month. */
export function getMonthWeekGlances(
  year: number,
  monthIndex: number,
  now = new Date(),
): MonthWeekGlance[] {
  const monthStart = startOfMonth(new Date(year, monthIndex, 1));
  const monthEnd = endOfMonth(monthStart);
  const firstMonday = getWeekStart(monthStart);
  const { current } = getPlanningBounds(now);

  const weeks: MonthWeekGlance[] = [];
  let cursor = firstMonday;
  while (cursor <= monthEnd) {
    const weekStart = formatWeekStart(cursor);
    const days = getWeekDays(cursor);
    const intersects = days.some(
      (d) => d.getMonth() === monthIndex && d.getFullYear() === year,
    );
    if (intersects) {
      const end = days[6]!;
      const isCurrent = weekStart === current;
      weeks.push({
        weekStart,
        label: isCurrent ? "This week" : format(cursor, "MMM d"),
        rangeLabel: `${format(cursor, "MMM d")} – ${format(end, "MMM d")}`,
        inPlanningWindow: isInPlanningWindow(weekStart, now),
        isCurrent,
      });
    }
    cursor = addWeeks(cursor, 1);
  }
  return weeks;
}

export function getCalendarMonthAnchor(weekStart: string): {
  year: number;
  monthIndex: number;
} {
  // Prefer the Thursday of the week so ISO-ish months feel right
  const days = getWeekDays(parseWeekStart(weekStart));
  const anchor = days[3] ?? days[0]!;
  return { year: anchor.getFullYear(), monthIndex: anchor.getMonth() };
}

/** Days in a month grid starting Monday (for optional calendar paint). */
export function getMonthGridDays(year: number, monthIndex: number): Date[] {
  const monthStart = startOfMonth(new Date(year, monthIndex, 1));
  const monthEnd = endOfMonth(monthStart);
  const gridStart = getWeekStart(monthStart);
  const gridEnd = getWeekStart(monthEnd);
  const lastCell = addWeeks(gridEnd, 0);
  lastCell.setDate(lastCell.getDate() + 6);
  return eachDayOfInterval({ start: gridStart, end: lastCell });
}
