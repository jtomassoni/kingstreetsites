"use client";

import { format } from "date-fns";
import type { PlannedMeal } from "@meals/types/database";
import { toDateOnlyString } from "@meals/lib/dates";
import { mealIdsForDayExport } from "@meals/components/week/day-meal-section";
import { cn } from "@meals/lib/utils";

type DayOption = { id: string; day_date: string | Date };

export function WeekMobileDayStrip({
  sortedDays,
  visibleMeals,
  activeDayId,
  today,
  onSelectDay,
  className,
  sticky = false,
  dayButtonRef,
}: {
  sortedDays: DayOption[];
  visibleMeals: PlannedMeal[];
  activeDayId: string | null;
  today: string;
  onSelectDay: (dayId: string, date: string) => void;
  className?: string;
  sticky?: boolean;
  dayButtonRef?: (dayId: string, el: HTMLButtonElement | null) => void;
}) {
  return (
    <nav
      aria-label="Jump to day"
      className={cn(
        "week-day-strip -mx-3 border-b border-border/70 bg-background/95 px-2 py-2 backdrop-blur min-[400px]:-mx-4 min-[400px]:px-3",
        sticky &&
          "sticky top-[calc(3.25rem+env(safe-area-inset-top))] z-[11]",
        className,
      )}
    >
      <ul className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sortedDays.map((day) => {
          const dayDate = toDateOnlyString(day.day_date);
          const date = new Date(`${dayDate}T12:00:00`);
          const isToday = dayDate === today;
          const active = activeDayId === day.id;
          const count = mealIdsForDayExport(visibleMeals, day.id).length;
          return (
            <li key={day.id} className="shrink-0">
              <button
                type="button"
                ref={(el) => dayButtonRef?.(day.id, el)}
                onClick={() => onSelectDay(day.id, dayDate)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-11 min-w-[3.25rem] flex-col items-center justify-center rounded-xl px-2.5 py-1.5 transition-colors active:scale-[0.97]",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                    : isToday
                      ? "bg-primary/12 text-primary ring-1 ring-primary/25"
                      : "bg-secondary/80 text-foreground hover:bg-secondary",
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                  {format(date, "EEE")}
                </span>
                <span className="text-sm font-semibold tabular-nums leading-none">
                  {format(date, "d")}
                </span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "mt-0.5 text-[9px] tabular-nums",
                      active
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                ) : (
                  <span className="mt-0.5 h-2.5" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
