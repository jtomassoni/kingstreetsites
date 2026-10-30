"use client";

import { FillWeekButton } from "@meals/components/week/fill-week-button";
import { GenerateMealIdeasButton } from "@meals/components/week/generate-meal-ideas-panel";
import {
  WeekBulkMenu,
  type MealSlotCounts,
} from "@meals/components/week/week-bulk-menu";
import type { PlanDay } from "@meals/types/database";

type MemberOption = { id: string; name: string };

export function WeekActions({
  planId,
  weekStart,
  aiEnabled,
  members,
  days,
  mealCounts,
}: {
  planId: string;
  weekStart: string;
  aiEnabled: boolean;
  members: MemberOption[];
  days: Pick<PlanDay, "id" | "day_date">[];
  mealCounts: MealSlotCounts;
}) {
  return (
    <div className="flex w-full flex-wrap items-stretch gap-2 md:w-auto md:justify-end">
      <GenerateMealIdeasButton
        planId={planId}
        weekStart={weekStart}
        aiEnabled={aiEnabled}
        members={members}
        days={days}
      />
      <FillWeekButton days={days} />
      <WeekBulkMenu planId={planId} counts={mealCounts} />
    </div>
  );
}
