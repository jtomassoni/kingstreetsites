"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@meals/components/ui/button";
import { useFillWeek } from "@meals/components/week/fill-week-context";
import {
  defaultDayDate,
  parseCalendarDate,
} from "@meals/lib/week/calendar-view";
import { toDateOnlyString } from "@meals/lib/dates";
import type { PlanDay } from "@meals/types/database";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function FillWeekButton({
  days,
  disabled,
}: {
  days: Pick<PlanDay, "id" | "day_date">[];
  disabled?: boolean;
}) {
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const { reviewing, pending, startReview } = useFillWeek();

  const dateParam = parseCalendarDate(searchParams.get("date"));
  const activeDate = defaultDayDate(days, dateParam);
  const activeDay =
    days.find((day) => toDateOnlyString(day.day_date) === activeDate) ??
    days[0];

  function handleClick() {
    if (isMobile && activeDay) {
      startReview({ planDayId: activeDay.id });
      return;
    }
    startReview();
  }

  const label = pending ? "Filling…" : isMobile ? "Fill day" : "Fill week";

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled || pending || reviewing}
      className="min-h-11 flex-1 sm:flex-none md:min-h-9"
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}
