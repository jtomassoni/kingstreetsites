"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { parseRecipeFromText } from "@meals/actions/ai";
import { Button } from "@meals/components/ui/button";
import { Label } from "@meals/components/ui/label";
import { Textarea } from "@meals/components/ui/textarea";
import type { AiRecipe } from "@meals/lib/ai/schemas";
import {
  hasRecipeParseContext,
  type RecipeParseContext,
} from "@meals/lib/recipes/parse-recipe-request";
import {
  MIN_RECIPE_FEEDBACK_CHARS,
  MIN_RECIPE_PASTE_CHARS,
} from "@meals/lib/recipes/validate-recipe-paste";

export function PasteRecipePanel({
  relatedRecipeId,
  currentRecipe,
  onParsed,
}: {
  relatedRecipeId?: string;
  currentRecipe?: RecipeParseContext | null;
  onParsed: (recipe: AiRecipe, model: string) => void;
}) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const revising = hasRecipeParseContext(currentRecipe);
  const minChars = revising ? MIN_RECIPE_FEEDBACK_CHARS : MIN_RECIPE_PASTE_CHARS;

  return (
    <section className="space-y-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3">
      <div className="space-y-0.5">
        <Label htmlFor="paste-recipe" className="text-sm font-semibold">
          {revising ? "Paste a recipe or feedback" : "Paste a recipe"}
        </Label>
        <p className="text-xs text-muted-foreground">
          {revising
            ? "Paste a full recipe, or a note about what to change — cheeses, swaps, steps. We’ll update the fields below. Review, then save."
            : "Copy from a site, notes, or a text. We’ll fill the fields below — review, then save."}
        </p>
      </div>
      <Textarea
        id="paste-recipe"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          revising
            ? "Use cotija and queso fresco instead of cheddar."
            : "Ingredients, steps, servings — paste the whole thing."
        }
        rows={5}
        disabled={pending}
        className="min-h-24 resize-y bg-background"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full gap-1.5"
        disabled={pending || text.trim().length < minChars}
        onClick={() => {
          start(async () => {
            const result = await parseRecipeFromText({
              text,
              relatedRecipeId,
              currentRecipe: revising ? currentRecipe : null,
            });
            if (result.error) {
              toast.error(result.error);
              return;
            }
            if (result.recipe) {
              onParsed(result.recipe, result.model);
              setText("");
              toast.success(
                revising
                  ? "Updated — review the fields below, then save."
                  : "Parsed — review the fields below, then save.",
              );
            }
          });
        }}
      >
        <Sparkles className="size-3.5" aria-hidden />
        {pending ? "Parsing…" : revising ? "Apply with AI" : "Parse with AI"}
      </Button>
    </section>
  );
}
