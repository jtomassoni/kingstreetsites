"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deletePlannedMeal, duplicatePlannedMeal } from "@meals/actions/plans";
import { Badge } from "@meals/components/ui/badge";
import { Button } from "@meals/components/ui/button";
import type { PlannedMeal } from "@meals/types/database";
import { MEAL_TYPES } from "@meals/types/enums";

export function MealCard({
  meal,
  memberName,
}: {
  meal: PlannedMeal;
  memberName?: string | null;
}) {
  const [pending, start] = useTransition();
  const mealTypeLabel =
    MEAL_TYPES.find((t) => t.value === meal.meal_type)?.label ??
    meal.meal_type.replace("_", " ");

  return (
    <div className="rounded-xl border border-border bg-background/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium leading-tight">{meal.title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="secondary">{mealTypeLabel}</Badge>
            <Badge variant="outline">
              {meal.assigned_to === "both" ? "Both" : memberName ?? "One person"}
            </Badge>
            {meal.servings ? (
              <Badge variant="outline">
                {meal.servings} portion{meal.servings === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          {meal.notes ? (
            <p className="mt-1 text-xs text-muted-foreground">{meal.notes}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await duplicatePlannedMeal(meal.id);
              if (r.error) toast.error(r.error);
            })
          }
        >
          Duplicate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deletePlannedMeal(meal.id);
              if (r.error) toast.error(r.error);
            })
          }
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
