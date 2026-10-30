"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { deletePlannedMeal } from "@meals/actions/plans";
import { PlannedMealDialog } from "@meals/components/week/planned-meal-dialog";
import { useWeekBulk } from "@meals/components/week/week-bulk-context";
import { deletePlannedMealPortionWarning } from "@meals/lib/meals/calendar-portions";
import type { PlannedMeal } from "@meals/types/database";
import { cn } from "@meals/lib/utils";

const MEAL_ACCENT: Record<string, string> = {
  breakfast:
    "border-l-[var(--meal-breakfast-rail)] bg-[var(--meal-breakfast-bg)]",
  lunch: "border-l-[var(--meal-lunch-rail)] bg-[var(--meal-lunch-bg)]",
  dinner: "border-l-[var(--meal-dinner-rail)] bg-[var(--meal-dinner-bg)]",
  snack_prep: "border-l-[var(--meal-snack-rail)] bg-[var(--meal-snack-bg)]",
  other: "border-l-primary bg-card",
};

export function CalendarMealChip({
  meal,
  memberName,
  members,
  weekMeals,
  onRemoved,
}: {
  meal: PlannedMeal;
  memberName?: string | null;
  members: { id: string; name: string }[];
  weekMeals?: PlannedMeal[];
  aiEnabled?: boolean;
  onRemoved?: (mealId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { selecting, isSelected, toggleSelected } = useWeekBulk();
  const selected = isSelected(meal.id);
  const accent = MEAL_ACCENT[meal.meal_type] ?? MEAL_ACCENT.other;
  const who =
    meal.assigned_to === "specific" && memberName
      ? memberName.split(" ")[0] || memberName
      : meal.assigned_to === "both"
        ? "Both"
        : null;

  async function removeMeal() {
    if (removing) return;
    if (weekMeals?.length) {
      const warning = deletePlannedMealPortionWarning(meal, weekMeals);
      if (warning) toast.warning(warning);
    }
    setRemoving(true);
    const r = await deletePlannedMeal(meal.id);
    if (r.error) {
      setRemoving(false);
      toast.error(r.error);
      return;
    }
    onRemoved?.(meal.id);
  }

  return (
    <>
      <div className="week-meal-chip group relative">
        <button
          type="button"
          aria-pressed={selecting ? selected : undefined}
          onClick={() => {
            if (removing) return;
            if (selecting) {
              toggleSelected(meal.id);
              return;
            }
            setOpen(true);
          }}
          disabled={removing}
          className={cn(
            "w-full rounded-xl border border-border/70 border-l-[3px] text-left shadow-[0_1px_0_color-mix(in_srgb,white_45%,transparent)_inset] transition-[transform,box-shadow,border-color,background-color] active:scale-[0.99] hover:border-border hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-lg md:px-2.5 md:py-2",
            selecting ? "flex items-start gap-2.5 px-2.5 py-2.5" : "px-2.5 py-2.5 pr-10 md:pr-8",
            accent,
            removing && "pointer-events-none",
            selecting &&
              selected &&
              "border-primary/50 bg-primary/10 shadow-none",
          )}
        >
          {selecting ? (
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/35 bg-background/90",
              )}
              aria-hidden
            >
              {selected ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
          ) : null}
          <div className={cn("min-w-0 flex-1", removing && "opacity-40")}>
            <p className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-foreground">
              {meal.title}
            </p>
            {who ? (
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                {who}
              </p>
            ) : null}
          </div>
        </button>
        {removing ? (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/55"
            aria-hidden
          >
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        ) : selecting ? null : (
          <button
            type="button"
            aria-label={`Remove ${meal.title}`}
            className="week-meal-chip-remove absolute right-1 top-1 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground active:bg-foreground/12 md:size-7 md:opacity-0"
            onClick={() => {
              void removeMeal();
            }}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <PlannedMealDialog
        meal={meal}
        members={members}
        weekMeals={weekMeals}
        open={open}
        onOpenChange={setOpen}
        onRemoved={onRemoved}
      />
    </>
  );
}
