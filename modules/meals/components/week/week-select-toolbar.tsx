"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { assignPlannedMeals, deletePlannedMeals } from "@meals/actions/plans";
import { useWeekBulk } from "@meals/components/week/week-bulk-context";
import { Button } from "@meals/components/ui/button";
import { cn } from "@meals/lib/utils";
import { sittingServings } from "@meals/lib/meals/appetite";
import { deletePlannedMealsPortionWarnings } from "@meals/lib/meals/calendar-portions";
import { formatPortionsLabel } from "@meals/lib/recipes/display";
import type { PlannedMeal } from "@meals/types/database";

type MemberOption = { id: string; name: string };

export function WeekSelectToolbar({
  planId,
  members,
  weekMeals,
  visibleMealIds,
  onRemoved,
}: {
  planId: string;
  members: MemberOption[];
  weekMeals: PlannedMeal[];
  visibleMealIds: string[];
  onRemoved: (mealIds: string[]) => void;
}) {
  const router = useRouter();
  const {
    selectedCount,
    selectedIds,
    selectAll,
    clearSelected,
    setSelecting,
  } = useWeekBulk();
  const [pending, start] = useTransition();
  const selectedList = [...selectedIds];
  const hasSelection = selectedCount > 0;

  function assign(assignedTo: "both" | "specific", assignedToUserId?: string) {
    if (!selectedList.length) return;
    start(async () => {
      const result = await assignPlannedMeals({
        weeklyPlanId: planId,
        mealIds: selectedList,
        assignedTo,
        assignedToUserId: assignedToUserId ?? null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Updated ${result.updated ?? selectedList.length} meal${(result.updated ?? selectedList.length) === 1 ? "" : "s"}`,
      );
      clearSelected();
      router.refresh();
    });
  }

  function removeSelected() {
    if (!selectedList.length) return;
    for (const warning of deletePlannedMealsPortionWarnings(
      selectedList,
      weekMeals,
    )) {
      toast.warning(warning);
    }
    start(async () => {
      const result = await deletePlannedMeals({
        weeklyPlanId: planId,
        mealIds: selectedList,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onRemoved(selectedList);
      toast.success(
        `Removed ${result.deleted ?? selectedList.length} meal${(result.deleted ?? selectedList.length) === 1 ? "" : "s"}`,
      );
      clearSelected();
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-card/95 px-3 py-2 shadow-sm backdrop-blur-sm sm:mb-2 sm:py-2.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-tight">
          {hasSelection
            ? `${selectedCount} selected`
            : "Select meals"}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={pending || visibleMealIds.length === 0}
            onClick={() => selectAll(visibleMealIds)}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={pending || !hasSelection}
            onClick={clearSelected}
          >
            None
          </Button>
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 px-3 text-xs"
            disabled={pending}
            onClick={() => setSelecting(false)}
          >
            Done
          </Button>
        </div>
      </div>

      {hasSelection ? (
        <>
          <div className="mt-2.5">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Assign to
            </p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <AssignChip
                label="Both"
                disabled={pending}
                onClick={() => assign("both")}
              />
              {members.map((member) => (
                <AssignChip
                  key={member.id}
                  label={member.name.split(" ")[0] || member.name}
                  disabled={pending}
                  onClick={() => assign("specific", member.id)}
                />
              ))}
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            className="mt-2 h-9 w-full gap-1.5 border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={removeSelected}
          >
            <Trash2 className="size-3.5" aria-hidden />
            {pending ? "Working…" : "Remove selected"}
          </Button>

          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Both = {formatPortionsLabel(sittingServings("both"))} · one person ={" "}
            {formatPortionsLabel(sittingServings("specific"))}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Tap meals, days, or meal types on the calendar.
        </p>
      )}
    </div>
  );
}

function AssignChip({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "shrink-0 min-h-9 rounded-lg bg-secondary/90 px-3 text-sm font-medium text-secondary-foreground transition-colors",
        "hover:bg-secondary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {label}
    </button>
  );
}
