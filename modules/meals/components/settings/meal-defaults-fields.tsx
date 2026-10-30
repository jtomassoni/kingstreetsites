"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  EMPTY_MEAL_DEFAULTS,
  MAX_DEFAULTS_PER_SLOT,
  MEAL_DEFAULT_SLOTS,
  hasFullWeekMenu,
  parseMealDefaults,
  type MealDefaultOption,
  type MealDefaultSlot,
  type MealDefaults,
} from "@meals/lib/meals/defaults";
import type { RecipeSearchOption } from "@meals/components/recipes/recipe-search-picker";
import { Input } from "@meals/components/ui/input";
import { classifyTitleMatch, rankTitleMatch } from "@meals/lib/ideas/match";
import { cn } from "@meals/lib/utils";

const MIN_QUERY = 3;
const MAX_RESULTS = 8;
const HIGHLIGHT_MS = 1600;

const SLOT_COPY: Record<
  MealDefaultSlot,
  { label: string; hint: string; empty: string }
> = {
  breakfast: {
    label: "Breakfast",
    hint: "Shuffled across the week",
    empty: "Search to add a usual breakfast",
  },
  lunch: {
    label: "Lunch",
    hint: "Optional if it changes often",
    empty: "Search to add a usual lunch",
  },
  dinner: {
    label: "Dinner",
    hint: "Fill week covers empty slots",
    empty: "Search to add a usual dinner",
  },
};

function SlotProgress({ count }: { count: number }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      aria-label={`${count} of ${MAX_DEFAULTS_PER_SLOT} filled`}
    >
      {Array.from({ length: MAX_DEFAULTS_PER_SLOT }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full transition-colors duration-200",
            i < count ? "bg-primary" : "bg-border",
          )}
        />
      ))}
      <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
        {count}/{MAX_DEFAULTS_PER_SLOT}
      </span>
    </div>
  );
}

function SlotColumn({
  slot,
  options,
  recipes,
  onChange,
  className,
}: {
  slot: MealDefaultSlot;
  options: MealDefaultOption[];
  recipes: RecipeSearchOption[];
  onChange: (next: MealDefaultOption[]) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const copy = SLOT_COPY[slot];
  const atMax = options.length >= MAX_DEFAULTS_PER_SLOT;
  const trimmed = query.trim();
  const ready = trimmed.length >= MIN_QUERY;
  const remaining = Math.max(0, MIN_QUERY - trimmed.length);

  const byId = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  );
  const selectedIds = useMemo(
    () =>
      new Set(
        options.map((o) => o.recipeId).filter((id): id is string => Boolean(id)),
      ),
    [options],
  );

  const matches = useMemo(() => {
    if (!ready || atMax) return [];
    const typed = recipes.filter(
      (r) =>
        !selectedIds.has(r.id) &&
        (r.mealTypes.length === 0 || r.mealTypes.includes(slot)),
    );
    const pool = typed.length
      ? typed
      : recipes.filter((r) => !selectedIds.has(r.id));
    return pool
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
  }, [ready, atMax, recipes, selectedIds, slot, trimmed]);

  useEffect(() => {
    if (!justAddedKey) return;
    const timer = window.setTimeout(() => setJustAddedKey(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [justAddedKey]);

  function addRecipe(recipe: RecipeSearchOption) {
    if (atMax || selectedIds.has(recipe.id)) return;
    const next = [
      ...options,
      { title: recipe.title, recipeId: recipe.id },
    ].slice(0, MAX_DEFAULTS_PER_SLOT);
    const key = `${slot}-${recipe.id}-${next.length - 1}`;
    onChange(next);
    setQuery("");
    setJustAddedKey(key);
    toast.success(`Added to ${copy.label.toLowerCase()}`, {
      description: recipe.title,
      duration: 2200,
    });
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-usual-key="${key}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl bg-background/70 ring-1 ring-border/70",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {copy.label}
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {copy.hint}
          </p>
        </div>
        <SlotProgress count={options.length} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        {atMax ? (
          <p className="rounded-lg bg-primary/8 px-2.5 py-2 text-[11px] leading-snug text-primary">
            Full week set — we only shuffle order for this meal.
          </p>
        ) : recipes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
            No active recipes.{" "}
            <Link
              href="/tools/meals/recipes"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Add some
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="relative z-10">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Add ${copy.label.toLowerCase()}…`}
                autoComplete="off"
                className="min-h-11 border-border/80 bg-card pl-8 text-sm shadow-none md:min-h-10"
                aria-label={`Search ${copy.label.toLowerCase()} recipes`}
                aria-autocomplete="list"
                aria-expanded={ready && matches.length > 0}
                aria-controls={`usual-${slot}-results`}
              />
            </div>

            {trimmed && !ready ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {remaining} more character{remaining === 1 ? "" : "s"} to search
              </p>
            ) : null}

            {ready && matches.length > 0 ? (
              <ul
                id={`usual-${slot}-results`}
                role="listbox"
                className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-20 max-h-52 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
              >
                {matches.map((row) => (
                  <li key={row.recipe.id} role="option">
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-primary/8 active:bg-primary/12"
                      onClick={() => addRecipe(row.recipe)}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {row.recipe.title}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">
                        <Plus className="size-3.5" />
                        Add
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {ready && matches.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                No matching active recipes
              </p>
            ) : null}
          </div>
        )}

        {options.length === 0 ? (
          <div className="flex min-h-24 flex-1 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/25 px-3 py-4 text-center md:min-h-0 md:py-5">
            <p className="text-xs leading-snug text-muted-foreground">
              {copy.empty}
            </p>
          </div>
        ) : (
          <ul ref={listRef} className="flex flex-1 flex-col gap-1.5">
            {options.map((option, index) => {
              const active = option.recipeId
                ? byId.get(option.recipeId)
                : undefined;
              const label = active?.title ?? option.title;
              const orphan = !option.recipeId || !active;
              const key = `${slot}-${option.recipeId ?? "t"}-${index}`;
              const justAdded = justAddedKey === key;
              return (
                <li
                  key={key}
                  data-usual-key={key}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                    orphan
                      ? "border-dashed border-muted-foreground/35 bg-muted/20"
                      : "border-primary/15 bg-primary/[0.04] hover:border-primary/30",
                    justAdded && "usual-meal-just-added",
                  )}
                >
                  {justAdded ? (
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                    title={
                      orphan
                        ? "Not an active library recipe — remove or replace"
                        : label
                    }
                  >
                    {label}
                  </span>
                  {orphan ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      inactive
                    </span>
                  ) : justAdded ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      added
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground md:size-7 md:opacity-70 md:hover:opacity-100"
                    aria-label={`Remove ${label}`}
                    onClick={() =>
                      onChange(options.filter((_, i) => i !== index))
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function activePayload(
  defaults: MealDefaults,
  recipes: RecipeSearchOption[],
  activeIds: Set<string>,
): MealDefaults {
  const slot = (options: MealDefaultOption[]) =>
    options
      .filter((o) => o.recipeId && activeIds.has(o.recipeId))
      .map((o) => ({
        title: (
          recipes.find((r) => r.id === o.recipeId)?.title ?? o.title
        ).trim(),
        recipeId: o.recipeId,
      }))
      .slice(0, MAX_DEFAULTS_PER_SLOT);
  return {
    breakfast: slot(defaults.breakfast),
    lunch: slot(defaults.lunch),
    dinner: slot(defaults.dinner),
  };
}

export function MealDefaultsFields({
  initial,
  recipes,
  className,
  onChange,
}: {
  initial?: unknown;
  recipes: RecipeSearchOption[];
  className?: string;
  onChange?: (defaults: MealDefaults) => void;
}) {
  const [defaults, setDefaults] = useState<MealDefaults>(() =>
    parseMealDefaults(initial ?? EMPTY_MEAL_DEFAULTS),
  );
  const [mobileSlot, setMobileSlot] = useState<MealDefaultSlot>("breakfast");

  const activeIds = useMemo(
    () => new Set(recipes.map((r) => r.id)),
    [recipes],
  );

  const payload = activePayload(defaults, recipes, activeIds);

  const fullWeek = hasFullWeekMenu(payload);
  const totalPicked =
    payload.breakfast.length + payload.lunch.length + payload.dinner.length;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-gradient-to-b from-card via-card/90 to-muted/30 p-3 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--primary)_8%,transparent)] md:min-h-0 md:gap-2.5 md:overflow-hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight text-foreground md:text-base">
            Usual meals
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground md:text-[11px]">
            Pick from your recipe library. We shuffle up to 7 per meal onto each
            week.
          </p>
        </div>
        <p
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] tabular-nums",
            fullWeek
              ? "bg-primary/12 font-medium text-primary"
              : "bg-muted/80 text-muted-foreground",
          )}
        >
          {fullWeek ? "Week covered" : `${totalPicked} selected`}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Meal type"
        className="grid grid-cols-3 gap-1 rounded-xl bg-muted/80 p-1 md:hidden"
      >
        {MEAL_DEFAULT_SLOTS.map((slot) => {
          const count = defaults[slot].length;
          const active = mobileSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMobileSlot(slot)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-xs font-semibold leading-tight">
                {SLOT_COPY[slot].label}
              </span>
              <span
                className={cn(
                  "text-[10px] tabular-nums leading-none",
                  count > 0 ? "font-medium text-primary" : "text-muted-foreground",
                )}
              >
                {count}/{MAX_DEFAULTS_PER_SLOT}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:min-h-0 md:flex-1 md:grid-cols-3 md:gap-3 md:overflow-y-auto">
        {MEAL_DEFAULT_SLOTS.map((slot) => (
          <SlotColumn
            key={slot}
            slot={slot}
            options={defaults[slot]}
            recipes={recipes}
            onChange={(next) => {
              const updated = {
                ...defaults,
                [slot]: next.slice(0, MAX_DEFAULTS_PER_SLOT),
              };
              setDefaults(updated);
              onChange?.(activePayload(updated, recipes, activeIds));
            }}
            className={cn(slot !== mobileSlot && "max-md:hidden")}
          />
        ))}
      </div>
    </div>
  );
}
