"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckSquare, Copy, Eraser, MoreHorizontal } from "lucide-react";
import {
  clearPlanMeals,
  copyPreviousWeekMeals,
} from "@meals/actions/plans";
import { useWeekBulk } from "@meals/components/week/week-bulk-context";
import { useFillWeekOptional } from "@meals/components/week/fill-week-context";
import { Button } from "@meals/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meals/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@meals/components/ui/dropdown-menu";
import type { MealType } from "@meals/types/database";

export type MealSlotCounts = {
  all: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  snack_prep: number;
};

type ConfirmAction =
  | { kind: "copy" }
  | { kind: "clear"; mealType?: MealType; label: string; count: number };

function mealTypeLabel(type: MealType) {
  if (type === "snack_prep") return "snacks";
  if (type === "lunch") return "lunches";
  return `${type}s`;
}

export function WeekBulkMenu({
  planId,
  counts,
}: {
  planId: string;
  counts: MealSlotCounts;
}) {
  const router = useRouter();
  const { selecting, setSelecting } = useWeekBulk();
  const fillWeek = useFillWeekOptional();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  function openConfirm(action: ConfirmAction) {
    setConfirm(action);
  }

  function run(action: () => Promise<{ error?: string; copied?: number; deleted?: number }>, success: (result: { copied?: number; deleted?: number }) => string) {
    start(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success(result));
      setConfirm(null);
      setSelecting(false);
      if (fillWeek?.reviewing) {
        fillWeek.abortReview();
      }
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="min-h-11 px-3 sm:flex-none"
            aria-label="Week bulk actions"
          >
            <MoreHorizontal className="size-4" />
            <span className="hidden min-[400px]:inline">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Bulk actions
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={pending || selecting || counts.all === 0}
            onSelect={() => setSelecting(true)}
          >
            <CheckSquare />
            Select meals
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              openConfirm({ kind: "copy" });
            }}
          >
            <Copy />
            Copy last week
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {(
            [
              ["breakfast", counts.breakfast],
              ["lunch", counts.lunch],
              ["dinner", counts.dinner],
              ["snack_prep", counts.snack_prep],
            ] as const
          ).map(([mealType, count]) => (
            <DropdownMenuItem
              key={mealType}
              disabled={pending || count === 0}
              onSelect={(event) => {
                event.preventDefault();
                openConfirm({
                  kind: "clear",
                  mealType,
                  label: mealTypeLabel(mealType),
                  count,
                });
              }}
            >
              <Eraser />
              Clear {mealTypeLabel(mealType)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={pending || counts.all === 0}
            className="text-destructive focus:text-destructive"
            onSelect={(event) => {
              event.preventDefault();
              openConfirm({
                kind: "clear",
                label: "this week",
                count: counts.all,
              });
            }}
          >
            <Eraser />
            Clear week
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirm(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm?.kind === "copy" ? "Copy last week?" : `Clear ${confirm?.label ?? "meals"}?`}
            </DialogTitle>
            <DialogDescription>
              {confirm?.kind === "copy"
                ? "Meals from last week go onto empty slots. Anything already on this week stays."
                : confirm
                  ? `Remove ${confirm.count} meal${confirm.count === 1 ? "" : "s"} from the calendar. Grocery will update in the background.`
                  : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirm?.kind === "clear" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "copy") {
                  run(
                    () => copyPreviousWeekMeals(planId),
                    (result) =>
                      `Copied ${result.copied ?? 0} meal${(result.copied ?? 0) === 1 ? "" : "s"} from last week`,
                  );
                  return;
                }
                run(
                  () =>
                    clearPlanMeals({
                      weeklyPlanId: planId,
                      mealType: confirm.mealType,
                    }),
                  (result) =>
                    `Removed ${result.deleted ?? 0} meal${(result.deleted ?? 0) === 1 ? "" : "s"}`,
                );
              }}
            >
              {pending
                ? "Working…"
                : confirm?.kind === "copy"
                  ? "Copy onto empty slots"
                  : "Clear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
