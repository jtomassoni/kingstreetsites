"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getRecipeDetail } from "@meals/actions/recipes";
import {
  RecipeForm,
  type RecipeFormInitial,
} from "@meals/components/recipes/recipe-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@meals/components/ui/dialog";
import { DEFAULT_RECIPE_SERVINGS } from "@meals/lib/meals/appetite";

function toFormInitial(
  detail: NonNullable<Awaited<ReturnType<typeof getRecipeDetail>>>,
): RecipeFormInitial {
  const { recipe, current, ingredients, steps } = detail;
  return {
    title: recipe.title,
    description: recipe.description,
    sourceType: recipe.source_type,
    sourceName: recipe.source_name,
    cuisine: recipe.cuisine,
    defaultServings: current?.default_servings ?? DEFAULT_RECIPE_SERVINGS,
    difficulty: current?.difficulty,
    ingredients: ingredients.map((ingredient) => ({
      ingredientName: ingredient.ingredient_name,
      quantity: ingredient.quantity?.toString() ?? "",
      unit: ingredient.unit ?? "",
      preparationNote: ingredient.preparation_note ?? "",
      groceryCategory: ingredient.grocery_category ?? "",
    })),
    steps: steps.map((step) => ({ instruction: step.instruction })),
  };
}

export function GroceryRecipeEditDialog({
  recipeId,
  onClose,
}: {
  recipeId: string | null;
  onClose: () => void;
}) {
  const [initial, setInitial] = useState<RecipeFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recipeId) {
      setInitial(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setInitial(null);
    setError(null);
    void getRecipeDetail(recipeId)
      .then((detail) => {
        if (cancelled) return;
        if (!detail) {
          setError("That recipe is no longer in your library.");
          return;
        }
        setInitial(toFormInitial(detail));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load that recipe.");
      });

    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  return (
    <Dialog open={recipeId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Improve recipe</DialogTitle>
          <DialogDescription>
            Paste feedback to tweak this recipe, or edit the fields. Saving
            creates a new version and keeps the previous one.
          </DialogDescription>
        </DialogHeader>
        {initial && recipeId ? (
          <RecipeForm
            key={recipeId}
            mode="edit"
            recipeId={recipeId}
            initial={initial}
            onSuccess={onClose}
          />
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading recipe…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
