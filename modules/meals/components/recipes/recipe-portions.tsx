"use client";

import { useState, type ReactNode } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { Button } from "@meals/components/ui/button";
import { DEFAULT_COOK_PORTIONS } from "@meals/lib/meals/appetite";
import {
  formatPortionsLabel,
  recipeBaseServings,
  toScaledDisplayIngredient,
} from "@meals/lib/recipes/display";
import { cn } from "@meals/lib/utils";

const MIN_PORTIONS = 1;
const MAX_PORTIONS = 24;

export type RecipePortionIngredient = {
  id: string;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  preparation_note: string | null;
  optional: boolean;
};

function PortionStepper({
  portions,
  onChange,
}: {
  portions: number;
  onChange: (next: number) => void;
}) {
  const label = formatPortionsLabel(portions);

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/80 p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 rounded-md"
        disabled={portions <= MIN_PORTIONS}
        onClick={() => onChange(Math.max(MIN_PORTIONS, portions - 1))}
        aria-label="Fewer portions"
      >
        <Minus className="size-3.5" aria-hidden />
      </Button>
      <span
        className="inline-flex min-w-[5.75rem] items-center justify-center gap-1 px-1 text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        <Users className="size-3 shrink-0 text-primary/70" aria-hidden />
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 rounded-md"
        disabled={portions >= MAX_PORTIONS}
        onClick={() => onChange(Math.min(MAX_PORTIONS, portions + 1))}
        aria-label="More portions"
      >
        <Plus className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

/** Ingredients scaled from the recipe’s written yield to the household cook batch. */
export function RecipePortionsBlock({
  baseServings,
  ingredients,
  steps,
}: {
  baseServings: number | null | undefined;
  ingredients: RecipePortionIngredient[];
  steps: ReactNode;
}) {
  const from = recipeBaseServings(baseServings);
  const [portions, setPortions] = useState(DEFAULT_COOK_PORTIONS);

  return (
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2 md:gap-4 md:overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card/80 p-3.5 md:overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">
            Ingredients
            <span className="ml-1.5 text-xs font-sans font-normal text-muted-foreground">
              {ingredients.length}
            </span>
          </h2>
          <PortionStepper portions={portions} onChange={setPortions} />
        </div>
        {ingredients.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No ingredients yet.
          </p>
        ) : (
          <ul className="mt-2.5 columns-1 gap-x-8 text-sm min-[480px]:columns-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
            {ingredients.map((raw) => {
              const ing = toScaledDisplayIngredient(raw, from, portions);
              return (
                <li
                  key={raw.id}
                  className={cn(
                    "mb-2 break-inside-avoid leading-snug",
                    ing.optional && "text-muted-foreground",
                  )}
                >
                  {ing.amount ? (
                    <span className="font-medium tabular-nums text-foreground/80">
                      {ing.amount}{" "}
                    </span>
                  ) : null}
                  <span>{ing.name}</span>
                  {ing.optional ? (
                    <span className="text-muted-foreground"> (opt)</span>
                  ) : null}
                  {ing.note ? (
                    <span className="text-muted-foreground"> — {ing.note}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {steps}
    </div>
  );
}
