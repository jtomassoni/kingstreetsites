"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { getMonthMealSummary } from "@meals/actions/plans";
import { Button } from "@meals/components/ui/button";
import {
  clampToPlanningWindow,
  formatWeekStart,
  getMonthGridDays,
  getPlanningBounds,
  isInPlanningWindow,
} from "@meals/lib/week/dates";
import { weekPathWithView } from "@meals/lib/week/calendar-view";
import { cn } from "@meals/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function MobileMonthView({
  weekStart,
  anchorDate,
  className,
}: {
  weekStart: string;
  anchorDate: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const bounds = useMemo(() => getPlanningBounds(), []);
  const anchor = parseISO(`${anchorDate}T12:00:00`);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(anchor));
  const [mealCounts, setMealCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const year = monthCursor.getFullYear();
  const monthIndex = monthCursor.getMonth();
  const days = getMonthGridDays(year, monthIndex);

  const minMonth = startOfMonth(parseISO(`${bounds.min}T12:00:00`));
  const maxMonth = startOfMonth(parseISO(`${bounds.max}T12:00:00`));
  const canPrevMonth = monthCursor > minMonth;
  const canNextMonth = monthCursor < maxMonth;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getMonthMealSummary(year, monthIndex)
      .then((summary) => {
        if (cancelled) return;
        setMealCounts(summary);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMealCounts({});
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, monthIndex]);

  function goToDay(dateStr: string) {
    const targetWeek = formatWeekStart(parseISO(`${dateStr}T12:00:00`));
    startTransition(() => {
      router.push(
        weekPathWithView(clampToPlanningWindow(targetWeek), {
          view: "day",
          date: dateStr,
        }),
      );
    });
  }

  return (
    <div
      className={cn(
        "space-y-3 px-1 pb-2 transition-opacity",
        (isPending || loading) && "opacity-70",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          disabled={!canPrevMonth || isPending}
          onClick={() => setMonthCursor((month) => addMonths(month, -1))}
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
          disabled={!canNextMonth || isPending}
          onClick={() => setMonthCursor((month) => addMonths(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1">
            {day.slice(0, 1)}
            <span className="sr-only">{day}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 px-1">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayWeek = formatWeekStart(day);
          const selectable = isInPlanningWindow(dayWeek);
          const inMonth = isSameMonth(day, monthCursor);
          const inCurrentWeek = dayWeek === weekStart;
          const isToday = isSameDay(day, new Date());
          const count = mealCounts[dateStr] ?? 0;

          return (
            <button
              key={dateStr}
              type="button"
              disabled={!selectable || isPending}
              onClick={() => goToDay(dateStr)}
              className={cn(
                "flex min-h-[3.25rem] w-full flex-col items-center justify-center rounded-xl px-1 py-1.5 text-sm font-medium transition-colors active:scale-[0.97]",
                !inMonth && "text-muted-foreground/45",
                inCurrentWeek && selectable && "bg-primary/10",
                isToday && "ring-2 ring-primary/45",
                selectable &&
                  "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !selectable && "cursor-not-allowed opacity-35",
              )}
              aria-label={
                count > 0
                  ? `${format(day, "EEEE, MMMM d")}, ${count} meals`
                  : format(day, "EEEE, MMMM d")
              }
            >
              <span className="tabular-nums leading-none">{format(day, "d")}</span>
              {count > 0 ? (
                <span className="mt-1 flex items-center gap-0.5">
                  {count <= 3 ? (
                    Array.from({ length: count }).map((_, index) => (
                      <span
                        key={index}
                        className="size-1 rounded-full bg-primary"
                        aria-hidden
                      />
                    ))
                  ) : (
                    <span className="text-[10px] font-semibold tabular-nums text-primary">
                      {count}
                    </span>
                  )}
                </span>
              ) : (
                <span className="mt-1 h-1" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <p className="px-2 text-xs text-muted-foreground">
        Tap a day to open it. Dots show planned meals.
      </p>
    </div>
  );
}
