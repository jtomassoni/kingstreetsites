"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Tabs, TabsList, TabsTrigger } from "@meals/components/ui/tabs";
import {
  defaultDayDate,
  parseCalendarDate,
  parseMobileCalendarView,
  type MobileCalendarView,
  weekPathWithView,
} from "@meals/lib/week/calendar-view";
import { cn } from "@meals/lib/utils";

export function MobileCalendarViewSwitcher({
  weekStart,
  dayDates,
  className,
}: {
  weekStart: string;
  dayDates: string[];
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const view = parseMobileCalendarView(searchParams.get("view"));
  const dateParam = parseCalendarDate(searchParams.get("date"));

  function setView(nextView: MobileCalendarView) {
    const date =
      nextView === "month"
        ? (dateParam ?? defaultDayDate(dayDates.map((day_date) => ({ day_date }))))
        : defaultDayDate(dayDates.map((day_date) => ({ day_date })), dateParam);

    startTransition(() => {
      router.replace(
        weekPathWithView(weekStart, { view: nextView, date }),
        { scroll: false },
      );
    });
  }

  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(parseMobileCalendarView(value))}
      className={cn("md:hidden", className, isPending && "opacity-70")}
    >
      <TabsList className="grid h-11 w-full grid-cols-3">
        <TabsTrigger value="day" className="min-h-9">
          Day
        </TabsTrigger>
        <TabsTrigger value="week" className="min-h-9">
          Week
        </TabsTrigger>
        <TabsTrigger value="month" className="min-h-9">
          Month
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
