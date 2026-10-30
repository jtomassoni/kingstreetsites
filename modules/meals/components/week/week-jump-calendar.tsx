"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@meals/components/ui/button";
import {
  formatWeekStart,
  getMonthGridDays,
  getPlanningBounds,
  isInPlanningWindow,
  parseWeekStart,
} from "@meals/lib/week/dates";
import { cn } from "@meals/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function WeekJumpCalendar({
  weekStart,
  onSelectWeek,
}: {
  weekStart: string;
  onSelectWeek: (weekStart: string) => void;
}) {
  const bounds = useMemo(() => getPlanningBounds(), []);
  const selectedStart = parseWeekStart(weekStart);

  const [monthCursor, setMonthCursor] = useState(() =>
    startOfMonth(selectedStart),
  );

  const year = monthCursor.getFullYear();
  const monthIndex = monthCursor.getMonth();
  const days = getMonthGridDays(year, monthIndex);

  const minMonth = startOfMonth(parseWeekStart(bounds.min));
  const maxMonth = startOfMonth(parseWeekStart(bounds.max));
  const canPrevMonth = monthCursor > minMonth;
  const canNextMonth = monthCursor < maxMonth;

  return (
    <div className="mx-auto w-full space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={!canPrevMonth}
          onClick={() => setMonthCursor((m) => addMonths(m, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <p className="font-display text-base font-semibold">
          {format(monthCursor, "MMMM yyyy")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={!canNextMonth}
          onClick={() => setMonthCursor((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d.slice(0, 1)}
            <span className="sr-only">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayWeek = formatWeekStart(day);
          const selectable = isInPlanningWindow(dayWeek);
          const inMonth = isSameMonth(day, monthCursor);
          const inSelectedWeek = dayWeek === weekStart;
          const isWeekStartDay = dayKey === weekStart;
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={dayKey}
              type="button"
              disabled={!selectable}
              onClick={() => onSelectWeek(dayWeek)}
              className={cn(
                "flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-medium transition-colors active:scale-[0.97]",
                !inMonth && "text-muted-foreground/50",
                inSelectedWeek &&
                  selectable &&
                  !isWeekStartDay &&
                  "bg-primary/15 text-foreground",
                isWeekStartDay && "bg-primary text-primary-foreground shadow-sm",
                isToday && !isWeekStartDay && "ring-2 ring-primary/45",
                selectable &&
                  !isWeekStartDay &&
                  "hover:bg-accent hover:text-accent-foreground",
                !selectable && "cursor-not-allowed opacity-35",
              )}
              aria-label={`Week of ${format(parseWeekStart(dayWeek), "MMM d")}`}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Tap any day to open that week.
      </p>
    </div>
  );
}
