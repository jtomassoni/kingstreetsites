"use client";

import { useMemo, useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@meals/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@meals/components/ui/sheet";
import { MobileCalendarViewSwitcher } from "@meals/components/week/mobile-calendar-view-switcher";
import { WeekMobileDayStrip } from "@meals/components/week/week-mobile-day-strip";
import type { PlannedMeal } from "@meals/types/database";
import { toDateOnlyString } from "@meals/lib/dates";
import {
  defaultDayDate,
  parseCalendarDate,
  parseMobileCalendarView,
  weekPathWithView,
} from "@meals/lib/week/calendar-view";
import {
  canNavigateDay,
  resolveAdjacentDayNavigation,
} from "@meals/lib/week/day-navigation";
import {
  clampToPlanningWindow,
  formatWeekStart,
  getCalendarMonthAnchor,
  getPlanningBounds,
  parseWeekStart,
} from "@meals/lib/week/dates";
import { cn } from "@meals/lib/utils";

type DayOption = { id: string; day_date: string | Date };

export function WeekMobileChrome({
  weekStart,
  sortedDays,
  visibleMeals,
  activeDayId,
  onSelectDay,
  children,
}: {
  weekStart: string;
  sortedDays: DayOption[];
  visibleMeals: PlannedMeal[];
  activeDayId: string | null;
  onSelectDay: (dayId: string, date: string) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const view = parseMobileCalendarView(searchParams.get("view"));
  const dateParam = parseCalendarDate(searchParams.get("date"));
  const today = format(new Date(), "yyyy-MM-dd");
  const dayDates = sortedDays.map((day) => toDateOnlyString(day.day_date));
  const activeDate = defaultDayDate(sortedDays, dateParam);
  const { current: currentWeek } = useMemo(() => getPlanningBounds(), []);
  const activeDay =
    sortedDays.find((day) => toDateOnlyString(day.day_date) === activeDate) ??
    sortedDays[0];

  const barLabel = useMemo(() => {
    if (view === "month") {
      const { year, monthIndex } = getCalendarMonthAnchor(weekStart);
      return format(new Date(year, monthIndex, 1), "MMMM yyyy");
    }
    if (view === "week") {
      const start = parseWeekStart(weekStart);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
    }
    const date = new Date(`${activeDate}T12:00:00`);
    return format(date, "EEE, MMM d");
  }, [activeDate, view, weekStart]);

  function navigateDay(delta: -1 | 1) {
    const next = resolveAdjacentDayNavigation({
      weekStart,
      sortedDays,
      activeDate,
      delta,
    });
    if (!next) return;

    if (next.kind === "cross-week") {
      startTransition(() => {
        router.push(
          weekPathWithView(next.weekStart, { view: "day", date: next.date }),
        );
      });
      return;
    }

    onSelectDay(next.dayId, next.date);
  }

  const prevDayDisabled =
    view !== "day" ||
    !canNavigateDay({ weekStart, sortedDays, activeDate, delta: -1 });
  const nextDayDisabled =
    view !== "day" ||
    !canNavigateDay({ weekStart, sortedDays, activeDate, delta: 1 });

  function onStripSelect(dayId: string, date: string) {
    onSelectDay(dayId, date);
    setOpen(false);
  }

  const showingToday =
    view === "day" && activeDate === today && weekStart === currentWeek;

  function goToToday() {
    setOpen(false);
    const targetWeek = clampToPlanningWindow(formatWeekStart(new Date()));
    startTransition(() => {
      router.push(weekPathWithView(targetWeek, { view: "day", date: today }));
    });
  }

  return (
    <div className={cn("md:hidden", isPending && "opacity-80")}>
      <div className="flex items-center gap-1">
        {view === "day" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            disabled={prevDayDisabled || isPending}
            onClick={() => navigateDay(-1)}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-5" />
          </Button>
        ) : (
          <span className="size-10 shrink-0" aria-hidden />
        )}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="group min-h-11 min-w-0 flex-1 gap-2 border-border bg-card/80 px-3 font-display text-base font-semibold tracking-tight shadow-sm hover:bg-secondary/80 data-[state=open]:border-primary/35 data-[state=open]:bg-primary/8"
              aria-label="Open calendar navigation"
            >
              <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 truncate">{barLabel}</span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle>Calendar</SheetTitle>
              <SheetDescription>
                Jump weeks, switch day/week/month views, or pick a day.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              {children}
              <MobileCalendarViewSwitcher
                weekStart={weekStart}
                dayDates={dayDates}
              />
              {view !== "month" ? (
                <WeekMobileDayStrip
                  sortedDays={sortedDays}
                  visibleMeals={visibleMeals}
                  activeDayId={activeDay?.id ?? activeDayId}
                  today={today}
                  onSelectDay={onStripSelect}
                />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>

        {view === "day" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            disabled={nextDayDisabled || isPending}
            onClick={() => navigateDay(1)}
            aria-label="Next day"
          >
            <ChevronRight className="size-5" />
          </Button>
        ) : (
          <span className="size-10 shrink-0" aria-hidden />
        )}
      </div>

      {!showingToday ? (
        <div className="mt-1 flex justify-center">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto min-h-0 px-2 py-0.5 text-xs font-normal text-muted-foreground"
            disabled={isPending}
            onClick={goToToday}
          >
            Back to today
          </Button>
        </div>
      ) : null}
    </div>
  );
}
