"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@meals/components/ui/popover";
import { WeekJumpCalendar } from "@meals/components/week/week-jump-calendar";
import {
  setTransitionIntent,
  weekTransitionIntent,
} from "@meals/lib/navigation/transition-intent";
import {
  buildWeekSearchParams,
  parseCalendarDate,
  parseMobileCalendarView,
  sameWeekdayInWeek,
} from "@meals/lib/week/calendar-view";
import {
  adjacentWeekInWindow,
  clampToPlanningWindow,
  formatWeekStart,
  getPlanningBounds,
  parseWeekStart,
} from "@meals/lib/week/dates";
import { cn } from "@meals/lib/utils";

export function WeekNavigator({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseMobileCalendarView(searchParams.get("view"));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const start = parseWeekStart(weekStart);
  const end = useMemo(() => {
    const d = new Date(start);
    d.setDate(start.getDate() + 6);
    return d;
  }, [start]);

  const bounds = useMemo(() => getPlanningBounds(), []);
  const prev = adjacentWeekInWindow(weekStart, -1);
  const next = adjacentWeekInWindow(weekStart, 1);
  const onCurrent = weekStart === bounds.current;

  const dateInputMin = bounds.min;
  const dateInputMax = useMemo(() => {
    const maxStart = parseWeekStart(bounds.max);
    const maxEnd = new Date(maxStart);
    maxEnd.setDate(maxStart.getDate() + 6);
    return format(maxEnd, "yyyy-MM-dd");
  }, [bounds.max]);

  function goToWeek(nextWeekStart: string) {
    const clamped = clampToPlanningWindow(nextWeekStart);
    setPickerOpen(false);
    if (clamped === weekStart) return;

    setTransitionIntent(weekTransitionIntent(weekStart, clamped));
    const dateParam = parseCalendarDate(searchParams.get("date"));
    const nextDate =
      view === "day" && dateParam
        ? sameWeekdayInWeek(dateParam, clamped)
        : dateParam;
    const query = buildWeekSearchParams({
      view,
      date: nextDate,
    });
    startTransition(() => {
      router.push(`/tools/meals/week/${clamped}${query}`);
    });
  }

  function onDateInputChange(value: string) {
    if (!value) return;
    const picked = parseISO(`${value}T12:00:00`);
    goToWeek(formatWeekStart(picked));
  }

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 transition-opacity duration-300 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center",
        isPending && "opacity-70",
      )}
    >
      <div className="week-nav-cluster w-full sm:w-auto sm:min-w-0 sm:flex-none">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-11 shrink-0 px-0 sm:min-h-10 sm:w-auto sm:gap-1 sm:px-2.5"
          disabled={!prev || isPending}
          onClick={() => prev && goToWeek(prev)}
          aria-label="Previous week"
        >
          <ChevronLeft className="size-5 sm:size-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 min-w-0 flex-1 gap-2 px-2.5 font-display sm:min-h-10 sm:flex-none sm:px-3"
              aria-label="Jump to week"
              aria-expanded={pickerOpen}
              disabled={isPending}
            >
              <CalendarIcon className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 truncate tabular-nums">
                <span className="sm:hidden">
                  {format(start, "MMM d")} – {format(end, "MMM d")}
                </span>
                <span className="hidden sm:inline">
                  {format(start, "MMM d")} – {format(end, "MMM d")}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  pickerOpen && "rotate-180",
                )}
                aria-hidden
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="center"
            collisionPadding={12}
            className="w-[min(100vw-1.5rem,22rem)] max-w-[calc(100vw-1.5rem)]"
          >
            <WeekJumpCalendar weekStart={weekStart} onSelectWeek={goToWeek} />
            <div className="mt-3 space-y-1 border-t border-border pt-3">
              <label
                htmlFor="week-jump-date"
                className="text-xs font-medium text-muted-foreground"
              >
                Or pick a date
              </label>
              <Input
                id="week-jump-date"
                type="date"
                className="min-h-11"
                min={dateInputMin}
                max={dateInputMax}
                defaultValue={format(start, "yyyy-MM-dd")}
                onChange={(e) => onDateInputChange(e.target.value)}
              />
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-11 shrink-0 px-0 sm:min-h-10 sm:w-auto sm:gap-1 sm:px-2.5"
          disabled={!next || isPending}
          onClick={() => next && goToWeek(next)}
          aria-label="Next week"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-5 sm:size-4" />
        </Button>
      </div>

      {!onCurrent ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full border-primary/25 bg-primary/5 px-3 text-primary hover:bg-primary/10 sm:min-h-10 sm:w-auto sm:px-2.5"
          disabled={isPending}
          onClick={() => goToWeek(bounds.current)}
        >
          Jump to this week
        </Button>
      ) : null}
    </div>
  );
}
