"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createRecipe, updateRecipeAsNewVersion } from "@meals/actions/recipes";
import { PasteRecipePanel } from "@meals/components/recipes/paste-recipe-panel";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import { Textarea } from "@meals/components/ui/textarea";
import {
  GROCERY_SECTIONS,
  inferGrocerySection,
} from "@meals/lib/grocery/sections";
import { aiRecipeToFormFields } from "@meals/lib/recipes/parsed-recipe-form";
import type { RecipeParseContext } from "@meals/lib/recipes/parse-recipe-request";
import { DEFAULT_RECIPE_SERVINGS } from "@meals/lib/meals/appetite";
import { DIFFICULTIES } from "@meals/types/enums";

type Ing = {
  ingredientName: string;
  quantity: string;
  unit: string;
  preparationNote: string;
  groceryCategory: string;
};
type Step = { instruction: string };

const emptyIngredient = (): Ing => ({
  ingredientName: "",
  quantity: "",
  unit: "",
  preparationNote: "",
  groceryCategory: "",
});

const fieldClass =
  "min-h-9 rounded-lg border border-input bg-background px-2.5 text-sm";

export type RecipeFormInitial = {
  title: string;
  description?: string | null;
  sourceType: string;
  sourceName?: string | null;
  cuisine?: string | null;
  defaultServings?: number;
  difficulty?: string | null;
  ingredients: Ing[];
  steps: Step[];
};

export function RecipeForm({
  mode,
  recipeId,
  initial,
  onSuccess,
}: {
  mode: "create" | "edit";
  recipeId?: string;
  initial?: RecipeFormInitial;
  aiEnabled?: boolean;
  onSuccess?: (recipeId: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [servings, setServings] = useState(
    String(initial?.defaultServings ?? DEFAULT_RECIPE_SERVINGS),
  );
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "");
  const [cuisine, setCuisine] = useState(initial?.cuisine ?? "");
  const [parsedSourceName, setParsedSourceName] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<Ing[]>(
    initial?.ingredients?.length
      ? initial.ingredients.map((ing) => ({
          ...emptyIngredient(),
          ...ing,
          groceryCategory:
            ing.groceryCategory ||
            inferGrocerySection(ing.ingredientName) ||
            "",
        }))
      : [emptyIngredient()],
  );
  const [steps, setSteps] = useState<Step[]>(
    initial?.steps?.length ? initial.steps : [{ instruction: "" }],
  );

  const currentRecipe: RecipeParseContext = {
    title,
    description,
    cuisine,
    defaultServings: Number(servings) || null,
    difficulty,
    ingredients: ingredients
      .filter((item) => item.ingredientName.trim())
      .map((item) => ({
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        unit: item.unit,
        preparationNote: item.preparationNote,
        groceryCategory: item.groceryCategory,
      })),
    steps: steps.filter((step) => step.instruction.trim()),
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const payload = {
            title,
            description: description.trim() || null,
            sourceType: (mode === "create" && parsedSourceName
              ? "transcribed"
              : (initial?.sourceType ??
                (mode === "create" ? "family" : "household"))) as never,
            sourceName:
              mode === "create"
                ? (parsedSourceName ?? initial?.sourceName ?? null)
                : (initial?.sourceName ?? null),
            cuisine: cuisine.trim() || null,
            defaultServings: Number(servings || DEFAULT_RECIPE_SERVINGS),
            difficulty: (difficulty || null) as never,
            changeSummary: String(fd.get("changeSummary") || "") || null,
            ingredients: ingredients
              .filter((i) => i.ingredientName.trim())
              .map((i) => ({
                ingredientName: i.ingredientName,
                quantity: i.quantity ? Number(i.quantity) : null,
                unit: i.unit || null,
                preparationNote: i.preparationNote || null,
                groceryCategory:
                  i.groceryCategory ||
                  inferGrocerySection(i.ingredientName) ||
                  null,
              })),
            steps: steps.filter((s) => s.instruction.trim()),
          };

          const result =
            mode === "create"
              ? await createRecipe(payload)
              : await updateRecipeAsNewVersion(recipeId!, payload);

          if (result.error) toast.error(result.error);
          else {
            toast.success(
              mode === "create" ? "Recipe saved" : "New version saved",
            );
            const id =
              "recipeId" in result && result.recipeId
                ? result.recipeId
                : recipeId!;
            if (onSuccess) {
              onSuccess(id);
              router.refresh();
            } else {
              router.push(`/tools/meals/recipes/${id}`);
              router.refresh();
            }
          }
        });
      }}
    >
      <PasteRecipePanel
        relatedRecipeId={recipeId}
        currentRecipe={currentRecipe}
        onParsed={(recipe, model) => {
          const fields = aiRecipeToFormFields(recipe);
          setTitle(fields.title);
          setDescription(fields.description);
          setServings(String(fields.defaultServings));
          setDifficulty(fields.difficulty);
          setCuisine(fields.cuisine);
          setIngredients(
            fields.ingredients.length
              ? fields.ingredients
              : [emptyIngredient()],
          );
          setSteps(
            fields.steps.length ? fields.steps : [{ instruction: "" }],
          );
          setParsedSourceName(model);
        }}
      />

      <section className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-10"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-0 resize-y"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label>Servings (as written)</Label>
            <Input
              name="servings"
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              className="min-h-10"
            />
          </div>
          <div className="space-y-1">
            <Label>Difficulty</Label>
            <select
              name="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">—</option>
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Cuisine</Label>
            <Input
              name="cuisine"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              className="min-h-10"
            />
          </div>
        </div>

        {mode === "edit" ? (
          <div className="space-y-1">
            <Label className="text-muted-foreground">
              Change note{" "}
              <span className="font-normal">(optional)</span>
            </Label>
            <Input
              name="changeSummary"
              placeholder="What changed?"
              className="min-h-9"
            />
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-semibold">Ingredients</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => setIngredients((v) => [...v, emptyIngredient()])}
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_3.25rem_4.5rem_minmax(5.5rem,0.9fr)_minmax(0,1fr)_2rem] gap-1.5 border-b border-border/60 bg-muted/40 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Aisle</span>
            <span>Prep</span>
            <span className="sr-only">Remove</span>
          </div>

          <ul className="divide-y divide-border/60">
            {ingredients.map((ing, idx) => (
              <li key={idx} className="bg-background px-2 py-2">
                <div className="grid grid-cols-[1fr_auto] gap-1.5 sm:grid-cols-[minmax(0,1.4fr)_3.25rem_4.5rem_minmax(5.5rem,0.9fr)_minmax(0,1fr)_2rem] sm:items-center">
                  <Input
                    className={`${fieldClass} col-span-2 sm:col-span-1`}
                    placeholder="Ingredient"
                    value={ing.ingredientName}
                    onChange={(e) => {
                      const name = e.target.value;
                      setIngredients((rows) =>
                        rows.map((r, i) => {
                          if (i !== idx) return r;
                          const prevAuto = inferGrocerySection(r.ingredientName);
                          const shouldFollowName =
                            !r.groceryCategory || r.groceryCategory === prevAuto;
                          return {
                            ...r,
                            ingredientName: name,
                            groceryCategory: shouldFollowName
                              ? inferGrocerySection(name)
                              : r.groceryCategory,
                          };
                        }),
                      );
                    }}
                  />
                  <Input
                    className={fieldClass}
                    placeholder="Qty"
                    inputMode="decimal"
                    value={ing.quantity}
                    onChange={(e) =>
                      setIngredients((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, quantity: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Input
                    className={fieldClass}
                    placeholder="Unit"
                    value={ing.unit}
                    onChange={(e) =>
                      setIngredients((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, unit: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <select
                    aria-label="Grocery aisle"
                    value={
                      ing.groceryCategory ||
                      inferGrocerySection(ing.ingredientName) ||
                      "other"
                    }
                    onChange={(e) =>
                      setIngredients((rows) =>
                        rows.map((r, i) =>
                          i === idx
                            ? { ...r, groceryCategory: e.target.value }
                            : r,
                        ),
                      )
                    }
                    className={`${fieldClass} col-span-2 sm:col-span-1`}
                  >
                    {GROCERY_SECTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    className={`${fieldClass} col-span-2 sm:col-span-1`}
                    placeholder="Prep note"
                    value={ing.preparationNote}
                    onChange={(e) =>
                      setIngredients((rows) =>
                        rows.map((r, i) =>
                          i === idx
                            ? { ...r, preparationNote: e.target.value }
                            : r,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${ing.ingredientName || "ingredient"}`}
                    disabled={ingredients.length <= 1}
                    onClick={() =>
                      setIngredients((rows) =>
                        rows.length <= 1
                          ? rows
                          : rows.filter((_, i) => i !== idx),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-semibold">Steps</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => setSteps((v) => [...v, { instruction: "" }])}
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        <ol className="space-y-2">
          {steps.map((step, idx) => (
            <li key={idx} className="flex gap-2">
              <span
                className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground"
                aria-hidden
              >
                {idx + 1}
              </span>
              <Textarea
                placeholder="What to do"
                rows={2}
                value={step.instruction}
                onChange={(e) =>
                  setSteps((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { instruction: e.target.value } : r,
                    ),
                  )
                }
                className="min-h-0 flex-1 resize-y"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 size-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove step ${idx + 1}`}
                disabled={steps.length <= 1}
                onClick={() =>
                  setSteps((rows) =>
                    rows.length <= 1
                      ? rows
                      : rows.filter((_, i) => i !== idx),
                  )
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      </section>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending
          ? "Saving…"
          : mode === "create"
            ? "Create recipe"
            : "Save as new version"}
      </Button>
    </form>
  );
}
