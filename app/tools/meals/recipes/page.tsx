import { listRecipes } from "@meals/actions/recipes";
import { AddRecipeDialog } from "@meals/components/recipes/add-recipe-dialog";
import { RecipeLibrarySearch } from "@meals/components/recipes/recipe-library-search";
import { Badge } from "@meals/components/ui/badge";
import { isAiEnabled } from "@meals/lib/env";
import { DEFAULT_COOK_PORTIONS } from "@meals/lib/meals/appetite";
import {
  formatPortionsLabel,
  isHiddenRecipeSourceType,
} from "@meals/lib/recipes/display";
import { cn } from "@meals/lib/utils";
import { DIFFICULTIES, MEAL_TYPES, SOURCE_TYPES } from "@meals/types/enums";
import { ChevronRight, Clock, Heart, Users } from "lucide-react";
import Link from "next/link";

const MOBILE_TAG_LIMIT = 2;

function recipeInitial(title: string) {
  return title.trim().charAt(0).toUpperCase() || "?";
}

function metaParts({
  timeLabel,
  servingsLabel,
  ingredientLabel,
}: {
  timeLabel: string | null;
  servingsLabel: string;
  ingredientLabel: string | null;
}) {
  return [timeLabel, servingsLabel, ingredientLabel].filter(Boolean) as string[];
}

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

function recipeBadges(recipe: {
  source_type: string;
  cuisine: string | null;
  meal_types: string[] | null;
  difficulty: string | null;
}) {
  const sourceLabel = isHiddenRecipeSourceType(recipe.source_type)
    ? null
    : labelFor(SOURCE_TYPES, recipe.source_type);
  const difficultyLabel = recipe.difficulty
    ? labelFor(DIFFICULTIES, recipe.difficulty)
    : null;
  const mealTypeLabels = (recipe.meal_types ?? []).map((t) =>
    labelFor(MEAL_TYPES, t),
  );

  return [
    ...(sourceLabel ? [sourceLabel] : []),
    ...(recipe.cuisine ? [recipe.cuisine] : []),
    ...mealTypeLabels,
    ...(difficultyLabel ? [difficultyLabel] : []),
  ];
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; liked?: string }>;
}) {
  const { q, liked } = await searchParams;
  const likedOnly = liked === "1" || liked === "true";
  const recipes = await listRecipes(q, { likedOnly });
  const aiEnabled = isAiEnabled();
  const emptyLibrary = recipes.length === 0 && !q?.trim() && !likedOnly;

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-4">
      <div className="space-y-3 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:space-y-0">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Recipes
          </h1>
          {recipes.length > 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {recipes.length} in your library
              {likedOnly ? " · liked" : null}
            </p>
          ) : null}
        </div>
        <AddRecipeDialog
          aiEnabled={aiEnabled}
          triggerClassName="w-full sm:w-auto"
        />
      </div>

      {emptyLibrary ? (
        <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Your library is empty. Tap{" "}
          <span className="font-medium text-foreground">Add recipe</span> to
          draft from a dish name or enter it manually.
        </p>
      ) : null}

      <RecipeLibrarySearch initialQuery={q ?? ""} likedOnly={likedOnly} />

      <ul className="flex flex-col gap-2.5">
        {recipes.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-6 text-sm text-muted-foreground">
            {emptyLibrary
              ? "No recipes yet."
              : likedOnly
                ? q?.trim()
                  ? "No liked recipes match that search."
                  : "No liked recipes yet. Open a recipe and tap Like to save it here."
                : "No recipes match that search."}
          </li>
        ) : (
          recipes.map((recipe) => {
            const badges = recipeBadges(recipe);
            const mobileBadges = badges.slice(0, MOBILE_TAG_LIMIT);
            const extraBadgeCount = badges.length - mobileBadges.length;
            const totalMinutes =
              recipe.total_time_minutes ??
              (recipe.prep_time_minutes != null ||
              recipe.cook_time_minutes != null
                ? (recipe.prep_time_minutes ?? 0) +
                  (recipe.cook_time_minutes ?? 0)
                : null);
            const timeLabel =
              totalMinutes && totalMinutes > 0
                ? formatMinutes(totalMinutes)
                : null;
            const servingsLabel = formatPortionsLabel(DEFAULT_COOK_PORTIONS);
            const ingredientLabel =
              recipe.ingredient_count > 0
                ? `${recipe.ingredient_count} ingredient${recipe.ingredient_count === 1 ? "" : "s"}`
                : null;
            const meta = metaParts({
              timeLabel,
              servingsLabel,
              ingredientLabel,
            });

            return (
              <li key={recipe.id}>
                <Link
                  href={`/tools/meals/recipes/${recipe.id}`}
                  className={cn(
                    "group flex items-start gap-3 rounded-2xl border border-border/70 bg-card/85 px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color,transform] active:scale-[0.995] active:bg-accent/35 sm:items-center sm:px-4 sm:py-3.5",
                    "hover:border-primary/35 hover:bg-accent/30",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.08] font-display text-sm font-semibold text-primary"
                    aria-hidden
                  >
                    {recipeInitial(recipe.title)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 font-medium leading-snug tracking-tight group-hover:text-primary">
                        {recipe.title}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                        {recipe.liked_by_me ? (
                          <Heart
                            className="size-3.5 fill-primary text-primary"
                            aria-label="Liked"
                          />
                        ) : null}
                        <ChevronRight
                          className="size-4 text-muted-foreground/60"
                          aria-hidden
                        />
                      </div>
                    </div>
                    {recipe.description ? (
                      <p className="hidden line-clamp-2 text-sm leading-snug text-muted-foreground sm:block">
                        {recipe.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      {badges.length > 0 ? (
                        <>
                          <div className="flex flex-wrap items-center gap-1 sm:hidden">
                            {mobileBadges.map((label) => (
                              <Badge
                                key={label}
                                variant="secondary"
                                className="rounded-md border-0 bg-muted/70 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                              >
                                {label}
                              </Badge>
                            ))}
                            {extraBadgeCount > 0 ? (
                              <span className="text-[10px] text-muted-foreground">
                                +{extraBadgeCount}
                              </span>
                            ) : null}
                          </div>
                          <div className="hidden flex-wrap items-center gap-1 sm:flex">
                            {badges.map((label) => (
                              <Badge
                                key={label}
                                variant="outline"
                                className="text-[11px] font-medium"
                              >
                                {label}
                              </Badge>
                            ))}
                          </div>
                        </>
                      ) : null}
                      {meta.length ? (
                        <p className="min-w-0 text-xs leading-snug text-muted-foreground sm:hidden">
                          {badges.length > 0 ? (
                            <span className="mr-2 text-border">·</span>
                          ) : null}
                          {meta.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    {meta.length ? (
                      <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:flex">
                        {timeLabel ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock
                              className="size-3 text-primary/70"
                              aria-hidden
                            />
                            {timeLabel}
                          </span>
                        ) : null}
                        {servingsLabel ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Users
                              className="size-3 text-primary/70"
                              aria-hidden
                            />
                            {servingsLabel}
                          </span>
                        ) : null}
                        {ingredientLabel ? (
                          <span>{ingredientLabel}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
