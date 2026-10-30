"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addPlannedMeal } from "@meals/actions/plans";
import {
  RecipeSearchPicker,
  type RecipeSearchOption,
} from "@meals/components/recipes/recipe-search-picker";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import { MEAL_TYPES } from "@meals/types/enums";
import { plannedMealServings } from "@meals/lib/meals/appetite";
import { formatPortionsLabel } from "@meals/lib/recipes/display";

type RecipeOption = RecipeSearchOption;

export function AddMealForm({
  planDayId,
  weeklyPlanId,
  members,
  recipes,
  mealType: lockedMealType,
  compact,
}: {
  planDayId: string;
  weeklyPlanId: string;
  members: { id: string; name: string }[];
  recipes: RecipeOption[];
  /** When set, meal type is fixed (slot already chosen). */
  mealType?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [mealType, setMealType] = useState<string>(lockedMealType ?? "dinner");
  const [recipeId, setRecipeId] = useState("");
  const [assigned, setAssigned] = useState("both");

  if (!open) {
    return (
      <Button
        variant={compact ? "outline" : "secondary"}
        size={compact ? "sm" : "default"}
        className={compact ? undefined : "w-full"}
        onClick={() => {
          if (lockedMealType) setMealType(lockedMealType);
          setOpen(true);
        }}
      >
        {compact ? "Choose recipe" : "Add meal"}
      </Button>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <p className="text-sm text-muted-foreground">
          Add recipes first, then schedule them here.
        </p>
        <div className="flex gap-2">
          <Button asChild className="flex-1">
            <Link href="/tools/meals/recipes">Go to recipes</Link>
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const selectedRecipeId = String(fd.get("recipeId") ?? "");
        if (!selectedRecipeId) {
          toast.error("Choose a recipe");
          return;
        }
        const assignedValue = String(fd.get("assigned") ?? assigned);
        const scope = assignedValue === "both" ? "both" : "specific";
        start(async () => {
          const result = await addPlannedMeal({
            planDayId,
            weeklyPlanId,
            recipeId: selectedRecipeId,
            mealType: String(fd.get("mealType") ?? "dinner") as never,
            assignedTo: scope,
            assignedToUserId: scope === "both" ? null : assignedValue,
            servings: plannedMealServings(scope),
            notes: String(fd.get("notes") || "") || null,
          });
          if (result.error) toast.error(result.error);
          else {
            toast.success("Meal added");
            setOpen(false);
            setRecipeId("");
          }
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Type</Label>
          {lockedMealType ? (
            <>
              <input type="hidden" name="mealType" value={lockedMealType} />
              <p className="flex min-h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm capitalize">
                {lockedMealType === "snack_prep" ? "Snack" : lockedMealType}
              </p>
            </>
          ) : (
            <select
              name="mealType"
              value={mealType}
              onChange={(e) => {
                setMealType(e.target.value);
                setRecipeId("");
              }}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              {MEAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <Label>For</Label>
          <select
            name="assigned"
            value={assigned}
            onChange={(e) => setAssigned(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="both">Both</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Cooks{" "}
        {formatPortionsLabel(
          plannedMealServings(assigned === "both" ? "both" : "specific"),
        )}{" "}
        for the shopping list.
      </p>
      <div className="space-y-1">
        <Label htmlFor={`recipe-${planDayId}`}>Recipe</Label>
        <input type="hidden" name="recipeId" value={recipeId} />
        <RecipeSearchPicker
          id={`recipe-${planDayId}`}
          recipes={recipes}
          value={recipeId}
          onChange={setRecipeId}
        />
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Input name="notes" placeholder="Optional" className="min-h-11" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
