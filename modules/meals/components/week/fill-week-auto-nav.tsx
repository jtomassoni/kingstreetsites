"use client";

import { useEffect, useRef } from "react";
import {
  registerFillWeekProposalsHandler,
  useFillWeekOptional,
} from "@meals/components/week/fill-week-context";
import { toDateOnlyString } from "@meals/lib/dates";

type DayLike = { id: string; day_date: string | Date };

function sortDays(days: DayLike[]) {
  return [...days].sort((a, b) =>
    toDateOnlyString(a.day_date).localeCompare(toDateOnlyString(b.day_date)),
  );
}

function dayIdsWithProposals(proposals: { planDayId: string }[]) {
  return new Set(proposals.map((proposal) => proposal.planDayId));
}

function firstDayNeedingAction(
  sortedDays: DayLike[],
  pendingDayIds: Set<string>,
): DayLike | null {
  return sortDays(sortedDays).find((day) => pendingDayIds.has(day.id)) ?? null;
}

export function nextDayNeedingAction(
  sortedDays: DayLike[],
  pendingDayIds: Set<string>,
  afterDayId: string,
): DayLike | null {
  const sorted = sortDays(sortedDays);
  const startIndex = sorted.findIndex((day) => day.id === afterDayId);
  if (startIndex < 0) return firstDayNeedingAction(sortedDays, pendingDayIds);

  for (let index = startIndex + 1; index < sorted.length; index++) {
    const day = sorted[index]!;
    if (pendingDayIds.has(day.id)) return day;
  }
  return null;
}

export { firstDayNeedingAction };

function pickTargetDay(
  sortedDays: DayLike[],
  pendingDayIds: Set<string>,
  activeDayId: string | null,
  context?: { lastPlanDayId?: string; initial?: boolean },
): DayLike | null {
  if (context?.initial) {
    return firstDayNeedingAction(sortedDays, pendingDayIds);
  }

  if (activeDayId && pendingDayIds.has(activeDayId)) {
    return null;
  }

  if (context?.lastPlanDayId) {
    const forward = nextDayNeedingAction(
      sortedDays,
      pendingDayIds,
      context.lastPlanDayId,
    );
    if (forward) return forward;
  }

  if (activeDayId) {
    const forward = nextDayNeedingAction(sortedDays, pendingDayIds, activeDayId);
    if (forward) return forward;
  }

  return firstDayNeedingAction(sortedDays, pendingDayIds);
}

/** Jump to the first pending day on start, then forward as each day is cleared. */
export function FillWeekAutoNav({
  sortedDays,
  activeDayId,
  onSelectDay,
}: {
  sortedDays: DayLike[];
  activeDayId: string | null;
  onSelectDay: (dayId: string, date: string) => void;
}) {
  const fillWeek = useFillWeekOptional();
  const activeDayIdRef = useRef(activeDayId);
  const sortedDaysRef = useRef(sortedDays);
  const onSelectDayRef = useRef(onSelectDay);

  activeDayIdRef.current = activeDayId;
  sortedDaysRef.current = sortedDays;
  onSelectDayRef.current = onSelectDay;

  useEffect(() => {
    if (!fillWeek?.reviewing) {
      registerFillWeekProposalsHandler(null);
      return;
    }

    registerFillWeekProposalsHandler((proposals, context) => {
      if (!proposals.length || !sortedDaysRef.current.length) return;

      const pendingDayIds = dayIdsWithProposals(proposals);
      const target = pickTargetDay(
        sortedDaysRef.current,
        pendingDayIds,
        activeDayIdRef.current,
        context,
      );

      if (!target || target.id === activeDayIdRef.current) return;
      onSelectDayRef.current(
        target.id,
        toDateOnlyString(target.day_date),
      );
    });

    return () => registerFillWeekProposalsHandler(null);
  }, [fillWeek?.reviewing]);

  return null;
}
