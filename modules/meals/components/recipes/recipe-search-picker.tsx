"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { ensureRecipeForMealPlan } from "@meals/actions/catalog-recipes";
import { Input } from "@meals/components/ui/input";
import { Button } from "@meals/components/ui/button";
import { classifyTitleMatch, rankTitleMatch } from "@meals/lib/ideas/match";
import { cn } from "@meals/lib/utils";

export type RecipeSearchOption = {
  id: string;
  title: string;
  mealTypes: string[];
};

const MIN_QUERY = 3;
const MAX_RESULTS = 12;

const SUGGESTION_COUNT = 8;

export function RecipeSearchPicker({
  recipes,
  mealType,
  value,
  onChange,
  id = "recipe-search",
  libraryOnly = false,
  placeholder = "Search or type a dish…",
  suggestWhenEmpty = false,
  autoFocus = false,
}: {
  recipes: RecipeSearchOption[];
  /** Optional: used only when creating a new recipe draft (not for filtering). */
  mealType?: string;
  value: string;
  onChange: (recipeId: string, meta?: { title: string }) => void;
  id?: string;
  /** When true, only select existing library recipes (no create). */
  libraryOnly?: boolean;
  placeholder?: string;
  /** Show recipe suggestions before the user types. */
  suggestWhenEmpty?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectedFromList = recipes.find((r) => r.id === value) ?? null;
  const selectedLabel = selectedFromList?.title ?? selectedTitle;
  const trimmed = query.trim();
  const ready = trimmed.length >= MIN_QUERY;

  const suggestions = useMemo(() => {
    if (!suggestWhenEmpty) return [];
    return [...recipes]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, SUGGESTION_COUNT);
  }, [suggestWhenEmpty, recipes]);

  const libraryMatches = useMemo(() => {
    if (!ready) return [];
    return recipes
      .map((r) => ({
        recipe: r,
        kind: classifyTitleMatch(trimmed, r.title),
        score: rankTitleMatch(trimmed, r.title),
      }))
      .filter((row) => row.kind !== "none")
      .sort(
        (a, b) =>
          b.score - a.score || a.recipe.title.localeCompare(b.recipe.title),
      )
      .slice(0, MAX_RESULTS);
  }, [ready, trimmed, recipes]);

  const hasExact = libraryMatches.some((row) => row.kind === "exact");

  function selectRecipe(recipeId: string, title: string) {
    setSelectedTitle(title);
    onChange(recipeId, { title });
    setQuery("");
  }

  function createBaseline() {
    start(async () => {
      const result = await ensureRecipeForMealPlan({
        title: trimmed,
        mealType,
      });
      if (result.error || !result.recipeId) {
        toast.error(result.error ?? "Could not add recipe");
        return;
      }
      const label =
        result.source === "ai"
          ? `Drafted “${result.title}”`
          : `Added “${result.title}”`;
      toast.success(label);
      selectRecipe(result.recipeId, result.title);
    });
  }

  if (value && selectedLabel) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] to-transparent px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">
            {selectedLabel}
          </p>
          <p className="text-[11px] text-muted-foreground">Ready to schedule</p>
        </div>
        <button
          type="button"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Clear selected recipe"
          onClick={() => {
            onChange("");
            setSelectedTitle(null);
            setQuery("");
          }}
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          className="min-h-11 pl-9"
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
        />
      </div>

      {!ready ? (
        suggestWhenEmpty && suggestions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Suggestions
            </p>
            <ul
              id={`${id}-results`}
              role="listbox"
              className="max-h-52 overflow-y-auto rounded-xl border border-border/80 bg-card/90"
            >
              {suggestions.map((recipe, index) => (
                <li key={recipe.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                      index > 0 && "border-t border-border/60",
                    )}
                    onClick={() => selectRecipe(recipe.id, recipe.title)}
                  >
                    {recipe.title}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Or type at least {MIN_QUERY} characters to search
              {libraryOnly ? "" : " / create"}.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Type at least {MIN_QUERY} characters to search
            {libraryOnly ? " your recipes" : ""}.
          </p>
        )
      ) : (
        <div className="space-y-2">
          {libraryMatches.length > 0 ? (
            <ul
              id={`${id}-results`}
              role="listbox"
              className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card"
            >
              {libraryMatches.map((row, index) => (
                <li key={row.recipe.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent",
                      index > 0 && "border-t border-border/70",
                    )}
                    onClick={() => selectRecipe(row.recipe.id, row.recipe.title)}
                  >
                    {row.recipe.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : pending ? (
            <p className="text-xs text-muted-foreground">Drafting recipe…</p>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {libraryOnly
                ? "No matching active recipes. Add the dish under Recipes first."
                : "Not in your library yet."}
            </p>
          )}

          {!libraryOnly && !hasExact ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={pending}
                onClick={createBaseline}
              >
                {pending ? "Drafting…" : `Create “${trimmed}”`}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                We’ll draft a baseline recipe you can edit later. If a similar
                dish is already in the book, pick it above instead.
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
