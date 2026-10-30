import { format, parseISO } from "date-fns";
import { toDateOnlyString } from "@meals/lib/dates";
import {
  formatWeekStart,
  getWeekDays,
  parseWeekStart,
} from "@meals/lib/week/dates";

export type MobileCalendarView = "day" | "week" | "month";

export function parseMobileCalendarView(
  value: string | null | undefined,
): MobileCalendarView {
  if (value === "week" || value === "month") return value;
  return "day";
}

export function parseCalendarDate(
  value: string | null | undefined,
): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function weekStartForDate(date: string): string {
  return formatWeekStart(parseISO(`${date}T12:00:00`));
}

export function sameWeekdayInWeek(date: string, targetWeekStart: string): string {
  const sourceWeekStart = weekStartForDate(date);
  const sourceDays = getWeekDays(parseWeekStart(sourceWeekStart));
  const targetDays = getWeekDays(parseWeekStart(targetWeekStart));
  const index = sourceDays.findIndex(
    (day) => format(day, "yyyy-MM-dd") === date,
  );
  const targetDay = targetDays[index >= 0 ? index : 0] ?? targetDays[0]!;
  return format(targetDay, "yyyy-MM-dd");
}

export function defaultDayDate(
  weekDays: { day_date: string | Date }[],
  preferred?: string | null,
): string {
  const dates = weekDays.map((day) => toDateOnlyString(day.day_date));
  if (preferred && dates.includes(preferred)) return preferred;
  const today = format(new Date(), "yyyy-MM-dd");
  if (dates.includes(today)) return today;
  return dates[0] ?? today;
}

export function buildWeekSearchParams(input: {
  view: MobileCalendarView;
  date?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("view", input.view);
  if (input.view === "day" && input.date) {
    params.set("date", input.date);
  }
  if (input.view === "month" && input.date) {
    params.set("date", input.date);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function weekPathWithView(
  weekStart: string,
  input: { view: MobileCalendarView; date?: string | null },
): string {
  return `/tools/meals/week/${weekStart}${buildWeekSearchParams(input)}`;
}
