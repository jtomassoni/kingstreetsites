import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Heart, Utensils } from "lucide-react";
import { getRecipeDetail, toggleRecipeLike } from "@meals/actions/recipes";
import {
  DeleteRecipeButton,
  RestoreRecipeButton,
} from "@meals/components/recipes/delete-recipe-button";
import { EditRecipeDialog } from "@meals/components/recipes/edit-recipe-dialog";
import { RecipeActivityPanel } from "@meals/components/activity/recipe-activity-panel";
import { RecipePortionsBlock } from "@meals/components/recipes/recipe-portions";
import { Button } from "@meals/components/ui/button";
import { Badge } from "@meals/components/ui/badge";
import { DIFFICULTIES, MEAL_TYPES, SOURCE_TYPES } from "@meals/types/enums";
import {
  expandStepsForDisplay,
  formatRecipeSourceDetail,
  isHiddenRecipeSourceType,
} from "@meals/lib/recipes/display";
import { DEFAULT_RECIPE_SERVINGS } from "@meals/lib/meals/appetite";
import { isAiEnabled } from "@meals/lib/env";
import { cn } from "@meals/lib/utils";

function labelFor(
  options: readonly { value: string; label: string }[],
  value: string,
) {
  return options.find((o) => o.value === value)?.label ?? value;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const detail = await getRecipeDetail(recipeId);
  if (!detail) notFound();
  const { recipe, current, ingredients, steps } = detail;
  const displaySteps = expandStepsForDisplay(steps);

  const sourceLabel = isHiddenRecipeSourceType(recipe.source_type)
    ? null
    : labelFor(SOURCE_TYPES, recipe.source_type);
  const difficultyLabel = current?.difficulty
    ? labelFor(DIFFICULTIES, current.difficulty)
    : null;
  const mealTypeLabels = (recipe.meal_types ?? []).map((t) =>
    labelFor(MEAL_TYPES, t),
  );
  const totalMinutes =
    current?.total_time_minutes ??
    (current?.prep_time_minutes != null || current?.cook_time_minutes != null
      ? (current.prep_time_minutes ?? 0) + (current.cook_time_minutes ?? 0)
      : null);
  const timeLabel =
    totalMinutes && totalMinutes > 0 ? formatMinutes(totalMinutes) : null;
  const sourceDetail = formatRecipeSourceDetail(
    recipe.source_type,
    recipe.source_name,
  );

  const facts = [
    timeLabel ? { icon: Clock, label: timeLabel } : null,
    difficultyLabel ? { icon: Utensils, label: difficultyLabel } : null,
  ].filter(Boolean) as { icon: typeof Clock; label: string }[];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 md:max-h-[calc(100dvh-5.5rem)] md:overflow-hidden">
      <div className="shrink-0 space-y-2">
        <Link
          href="/tools/meals/recipes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Recipes
        </Link>

        {!recipe.is_active ? (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Removed from your library. Meals already on the calendar still
              use it.
            </p>
            <RestoreRecipeButton recipeId={recipeId} />
          </div>
        ) : null}

        <header className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-start min-[480px]:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h1 className="font-display text-xl font-semibold tracking-tight min-[400px]:text-2xl sm:text-3xl">
              {recipe.title}
            </h1>
            {recipe.description ? (
              <p className="line-clamp-2 max-w-2xl text-sm leading-snug text-muted-foreground">
                {recipe.description}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {sourceLabel ? (
                <Badge variant="secondary" className="text-[11px]">
                  {sourceLabel}
                </Badge>
              ) : null}
              {recipe.cuisine ? (
                <Badge variant="outline" className="text-[11px]">
                  {recipe.cuisine}
                </Badge>
              ) : null}
              {mealTypeLabels.map((label) => (
                <Badge key={label} variant="outline" className="text-[11px]">
                  {label}
                </Badge>
              ))}
              {facts.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <Icon className="size-3 text-primary/70" aria-hidden />
                  {label}
                </span>
              ))}
              {sourceDetail ? (
                <span className="text-[11px] text-muted-foreground">
                  · {sourceDetail}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex w-full shrink-0 gap-2 min-[480px]:w-auto">
            <form
              className="contents"
              action={async () => {
                "use server";
                await toggleRecipeLike(recipeId);
              }}
            >
              <Button
                type="submit"
                size="sm"
                variant={recipe.liked_by_me ? "default" : "outline"}
                className="min-h-10 flex-1 gap-1.5 min-[480px]:flex-none"
                aria-pressed={recipe.liked_by_me}
              >
                <Heart
                  className={cn(
                    "size-3.5",
                    recipe.liked_by_me && "fill-current",
                  )}
                  aria-hidden
                />
                {recipe.liked_by_me ? "Liked" : "Like"}
              </Button>
            </form>
            {recipe.is_active ? (
              <DeleteRecipeButton recipeId={recipeId} title={recipe.title} />
            ) : null}
            <EditRecipeDialog
              recipeId={recipeId}
              aiEnabled={isAiEnabled()}
              initial={{
                title: recipe.title,
                description: recipe.description,
                sourceType: recipe.source_type,
                sourceName: recipe.source_name,
                cuisine: recipe.cuisine,
                defaultServings:
                  current?.default_servings ?? DEFAULT_RECIPE_SERVINGS,
                difficulty: current?.difficulty,
                ingredients: ingredients.map((i) => ({
                  ingredientName: i.ingredient_name,
                  quantity: i.quantity?.toString() ?? "",
                  unit: i.unit ?? "",
                  preparationNote: i.preparation_note ?? "",
                  groceryCategory: i.grocery_category ?? "",
                })),
                steps: steps.map((s) => ({ instruction: s.instruction })),
              }}
            />
          </div>
        </header>
      </div>

      <RecipePortionsBlock
        key={recipeId}
        baseServings={current?.default_servings}
        ingredients={ingredients.map((i) => ({
          id: i.id,
          ingredient_name: i.ingredient_name,
          quantity: i.quantity,
          unit: i.unit,
          preparation_note: i.preparation_note,
          optional: i.optional,
        }))}
        steps={
          <section className="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card/80 p-3.5 md:overflow-hidden">
            <h2 className="shrink-0 font-display text-base font-semibold">
              Steps
              <span className="ml-1.5 text-xs font-sans font-normal text-muted-foreground">
                {displaySteps.length}
              </span>
            </h2>
            {displaySteps.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No steps yet.</p>
            ) : (
              <ol className="mt-2.5 space-y-3 text-sm md:min-h-0 md:flex-1 md:overflow-y-auto">
                {displaySteps.map((step, index) => (
                  <li key={step.key} className="flex gap-2.5">
                    <span
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 font-display text-[11px] font-semibold text-primary"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <p className="min-w-0 leading-relaxed text-foreground/90">
                      {step.instruction}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        }
      />

      <details className="shrink-0 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">
          More
          {current?.equipment?.length
            ? ` · ${current.equipment.length} equipment`
            : ""}
        </summary>
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          {current?.equipment?.length ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Equipment
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {current.equipment.map((item) => (
                  <li key={item}>
                    <Badge variant="outline" className="text-[11px]">
                      {item}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {current?.storage_instructions ||
          current?.reheating_instructions ||
          current?.leftover_notes ? (
            <div className="space-y-1.5 text-sm leading-snug">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                After cooking
              </p>
              {current.storage_instructions ? (
                <p>
                  <span className="font-medium">Storage — </span>
                  <span className="text-muted-foreground">
                    {current.storage_instructions}
                  </span>
                </p>
              ) : null}
              {current.reheating_instructions ? (
                <p>
                  <span className="font-medium">Reheat — </span>
                  <span className="text-muted-foreground">
                    {current.reheating_instructions}
                  </span>
                </p>
              ) : null}
              {current.leftover_notes ? (
                <p>
                  <span className="font-medium">Leftovers — </span>
                  <span className="text-muted-foreground">
                    {current.leftover_notes}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>

      <RecipeActivityPanel recipeId={recipeId} />
    </div>
  );
}
