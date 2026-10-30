"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BookOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePlannedMeal, updatePlannedMeal } from "@meals/actions/plans";
import { Button } from "@meals/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@meals/components/ui/dialog";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import { MEAL_TYPES } from "@meals/types/enums";
import type { PlannedMeal } from "@meals/types/database";
import { cn } from "@meals/lib/utils";
import { sittingServings } from "@meals/lib/meals/appetite";
import { deletePlannedMealPortionWarning } from "@meals/lib/meals/calendar-portions";
import { formatPortionsLabel } from "@meals/lib/recipes/display";

type MemberOption = { id: string; name: string };

function mealTypeLabel(mealType: string) {
  return MEAL_TYPES.find((t) => t.value === mealType)?.label ?? mealType;
}

function assignmentScope(assigned: string): "both" | "specific" {
  return assigned === "both" ? "both" : "specific";
}

function AssignmentPills({
  members,
  value,
  onChange,
}: {
  members: { id: string; name: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  const options = [
    { id: "both", label: "Both" },
    ...members.map((m) => ({
      id: m.id,
      label: m.name.split(" ")[0] || m.name,
    })),
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Who is this meal for"
      className="flex flex-wrap gap-1.5"
    >
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "min-h-9 rounded-lg px-3 text-sm font-medium transition-colors",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/80 text-secondary-foreground hover:bg-secondary",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function PlannedMealDialog({
  meal,
  members,
  weekMeals,
  open,
  onOpenChange,
  onRemoved,
}: {
  meal: PlannedMeal;
  members: MemberOption[];
  weekMeals?: PlannedMeal[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: (mealId: string) => void;
  /** @deprecated unused — recipe editing lives on the recipe page */
  aiEnabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [removing, startRemove] = useTransition();
  const assignedDefault =
    meal.assigned_to === "specific" && meal.assigned_to_user_id
      ? meal.assigned_to_user_id
      : "both";
  const [assigned, setAssigned] = useState(assignedDefault);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setAssigned(assignedDefault);
        }
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="border-b border-border/70 px-4 py-4 text-left sm:px-5 sm:py-5">
          <DialogTitle className="font-display pr-6 text-xl leading-snug">
            {meal.title}
          </DialogTitle>
          <DialogDescription>
            {mealTypeLabel(meal.meal_type)} on your calendar — change who it’s
            for. This doesn’t edit the recipe itself.
          </DialogDescription>
        </DialogHeader>

        <form
          key={`${meal.id}-${open}`}
          className="space-y-4 px-4 py-4 sm:px-5 sm:py-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const scope = assignmentScope(assigned);
            start(async () => {
              const result = await updatePlannedMeal(meal.id, {
                assignedTo: scope,
                assignedToUserId: scope === "both" ? null : assigned,
                servings: sittingServings(scope),
                notes: String(fd.get("notes") || "") || null,
              });
              if (result.error) toast.error(result.error);
              else {
                toast.success("Meal updated");
                onOpenChange(false);
              }
            });
          }}
        >
          <div className="space-y-2">
            <Label className="text-muted-foreground">For</Label>
            <AssignmentPills
              members={members}
              value={assigned}
              onChange={setAssigned}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            This sitting {formatPortionsLabel(sittingServings(assignmentScope(assigned)))}.
          </p>

          <div className="space-y-1.5">
            <Label
              htmlFor={`meal-notes-${meal.id}`}
              className="text-muted-foreground"
            >
              Notes
            </Label>
            <Input
              id={`meal-notes-${meal.id}`}
              name="notes"
              placeholder="Prep ahead…"
              defaultValue={meal.notes ?? ""}
              className="min-h-11"
            />
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
          </Button>

          <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row">
            {meal.recipe_id ? (
              <Button asChild variant="outline" className="flex-1 gap-1.5">
                <Link href={`/tools/meals/recipes/${meal.recipe_id}`}>
                  <BookOpen className="size-3.5" aria-hidden />
                  Open recipe
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              disabled={removing}
              className="flex-1 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                startRemove(async () => {
                  if (weekMeals?.length) {
                    const warning = deletePlannedMealPortionWarning(
                      meal,
                      weekMeals,
                    );
                    if (warning) toast.warning(warning);
                  }
                  const r = await deletePlannedMeal(meal.id);
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success("Removed from calendar");
                    onOpenChange(false);
                    onRemoved?.(meal.id);
                  }
                });
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {removing ? "Removing…" : "Remove"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
