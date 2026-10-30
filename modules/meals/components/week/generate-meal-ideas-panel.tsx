"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  generateFullRecipeAction,
  generateMealIdeasAction,
  setMealIdeaStatusAction,
  type MealIdeaBoardIdea,
} from "@meals/actions/meal-ideas";
import { addRecipeSittings } from "@meals/actions/plans";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meals/components/ui/dialog";
import {
  MEAL_IDEA_CUISINE_CHIPS,
  MEAL_IDEA_EXCLUSION_CHIPS,
  MEAL_IDEA_INGREDIENT_CHIPS,
  MEAL_IDEA_VIBE_CHIPS,
  mergeIngredientSelections,
  toggleChipSelection,
} from "@meals/lib/meals/meal-idea-chips";
import type { FullRecipePayload } from "@meals/lib/ai/idea-schemas";
import type { GenerationErrorCode } from "@meals/lib/ai/generation-error";
import {
  DEFAULT_COOK_PORTIONS,
  calendarPortions,
  meetsMinCalendarPortions,
  NOT_ENOUGH_CALENDAR_PORTIONS_ERROR,
} from "@meals/lib/meals/appetite";
import { formatPortionsLabel } from "@meals/lib/recipes/display";
import { cn } from "@meals/lib/utils";
import { buildDefaultMealSittings } from "@meals/lib/week/meal-sittings";
import { toDateOnlyString } from "@meals/lib/dates";
import type { PlanDay } from "@meals/types/database";

type MemberOption = { id: string; name: string };
type WizardStep = "ingredients" | "vibes" | "preferences" | "results";

const SKIP_INGREDIENTS_LABEL = "Skip — nothing to use";
const SKIP_VIBES_LABEL = "Skip — surprise me";

function ChipFieldset({
  legend,
  hint,
  chips,
  selected,
  onToggle,
  disabled,
}: {
  legend: string;
  hint?: string;
  chips: readonly string[];
  selected: string[];
  onToggle: (chip: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const active = selected.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onToggle(chip)}
              className={cn(
                "min-h-9 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50",
                active
                  ? "border-primary bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {chip}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function EatingPills({
  members,
  value,
  onChange,
  disabled,
}: {
  members: MemberOption[];
  value: "both" | string;
  onChange: (next: "both" | string) => void;
  disabled?: boolean;
}) {
  const options = [
    { id: "both", label: "Both" },
    ...members.map((m) => ({
      id: m.id,
      label: m.name.split(" ")[0] || m.name,
    })),
  ];

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Who&apos;s eating?</legend>
      <p className="text-xs text-muted-foreground">
        Default is both of you — change only if one person sits out
      </p>
      <div
        role="radiogroup"
        aria-label="Who is eating"
        className="flex flex-wrap gap-2"
      >
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={cn(
                "min-h-9 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50",
                active
                  ? "border-primary bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function GenerateMealIdeasButton({
  planId,
  weekStart,
  aiEnabled,
  members,
  days,
}: {
  planId: string;
  weekStart: string;
  aiEnabled: boolean;
  members: MemberOption[];
  days: Pick<PlanDay, "id" | "day_date">[];
}) {
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<MealIdeaBoardIdea[]>([]);
  const [recipes, setRecipes] = useState<
    Record<string, FullRecipePayload | null>
  >({});
  const [step, setStep] = useState<WizardStep>("ingredients");
  const [ingredientsSkipped, setIngredientsSkipped] = useState(true);
  const [vibesSkipped, setVibesSkipped] = useState(true);
  const [eatingScope, setEatingScope] = useState<"both" | string>("both");
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [customIngredientsInput, setCustomIngredientsInput] = useState("");
  const [selectedExclusions, setSelectedExclusions] = useState<string[]>([]);
  const [customExclusionsInput, setCustomExclusionsInput] = useState("");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [busyIdeaId, setBusyIdeaId] = useState<string | null>(null);
  const [confirmRegenId, setConfirmRegenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollBodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  function resetWizard() {
    setStep("ingredients");
    setIngredientsSkipped(true);
    setVibesSkipped(true);
    setEatingScope("both");
    setSelectedVibes([]);
    setSelectedIngredients([]);
    setCustomIngredientsInput("");
    setSelectedExclusions([]);
    setCustomExclusionsInput("");
    setSelectedCuisines([]);
    setIdeas([]);
    setRecipes({});
    setError(null);
    setConfirmRegenId(null);
    setBusyIdeaId(null);
  }

  const dietaryFlags = useMemo(() => {
    if (eatingScope === "both") return [];
    const member = members.find((m) => m.id === eatingScope);
    return member ? [`${member.name} only`] : [];
  }, [members, eatingScope]);

  const effectiveIngredients = useMemo(
    () =>
      ingredientsSkipped
        ? []
        : mergeIngredientSelections(
            selectedIngredients,
            customIngredientsInput,
          ),
    [customIngredientsInput, ingredientsSkipped, selectedIngredients],
  );

  const effectiveExclusions = useMemo(
    () =>
      mergeIngredientSelections(selectedExclusions, customExclusionsInput),
    [customExclusionsInput, selectedExclusions],
  );

  function showError(result: {
    error?: string;
    errorCode?: GenerationErrorCode;
  }) {
    const message = result.error ?? "Something went wrong.";
    setError(message);
    toast.error(message);
  }

  function generate(opts?: { replaceIdeaId?: string }) {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await generateMealIdeasAction({
        weeklyPlanId: planId,
        weekStart,
        mealCount: 1,
        dietaryFlags,
        availableIngredients: effectiveIngredients,
        exclusions: effectiveExclusions,
        cuisines: selectedCuisines,
        notes: vibesSkipped ? "" : selectedVibes.join("; "),
        replaceIdeaId: opts?.replaceIdeaId,
      });
      if ("error" in result && result.error) {
        showError(result);
        return;
      }
      if ("ideas" in result) {
        setIdeas(result.ideas.slice(0, 1));
        setStep("results");
        toast.success(
          result.reused
            ? "Showing your saved suggestion"
            : "Suggested a meal",
        );
        router.refresh();
      }
    });
  }

  function rejectIdea(ideaId: string) {
    if (pending) return;
    start(async () => {
      const result = await setMealIdeaStatusAction({
        ideaId,
        status: "rejected",
      });
      if ("error" in result && result.error) {
        showError(result);
        return;
      }
      if ("idea" in result) {
        setIdeas((prev) =>
          prev.map((idea) => (idea.id === ideaId ? result.idea : idea)),
        );
      }
    });
  }

  function acceptIdea(ideaId: string) {
    generateRecipe(ideaId, false);
  }

  function generateRecipe(ideaId: string, regenerate: boolean) {
    if (pending) return;
    setBusyIdeaId(ideaId);
    setError(null);
    start(async () => {
      const result = await generateFullRecipeAction({
        mealIdeaId: ideaId,
        regenerate,
      });
      setBusyIdeaId(null);
      setConfirmRegenId(null);
      if ("error" in result && result.error) {
        showError(result);
        return;
      }
      if ("recipe" in result) {
        setRecipes((prev) => ({ ...prev, [ideaId]: result.recipe }));
        setIdeas((prev) =>
          prev.map((idea) =>
            idea.id === ideaId
              ? { ...idea, recipe_id: result.recipeId, status: "approved" }
              : idea,
          ),
        );
        toast.success("Recipe ready");
        router.refresh();
      }
    });
  }

  function addToWeek(idea: MealIdeaBoardIdea, planDayId: string) {
    if (!idea.recipe_id || pending) return;
    const defaults = buildDefaultMealSittings({
      planDayId,
      mealType: "dinner",
      days,
      occupied: new Set(),
    });
    const sittings = defaults.map((sitting) => ({
      planDayId: sitting.planDayId,
      mealType: "dinner" as const,
      assignedTo: "both" as const,
    }));
    if (!meetsMinCalendarPortions(sittings.map((s) => s.assignedTo))) {
      toast.error(NOT_ENOUGH_CALENDAR_PORTIONS_ERROR);
      return;
    }
    start(async () => {
      const result = await addRecipeSittings({
        weeklyPlanId: planId,
        recipeId: idea.recipe_id!,
        sittings,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Added ${idea.name} (${calendarPortions(sittings.map((s) => s.assignedTo))} portions)`,
      );
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) resetWizard();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!aiEnabled}
          className="min-h-11 flex-1 sm:flex-none"
        >
          Meal ideas
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(90dvh,40rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-4 text-left sm:px-6 sm:py-5">
          <DialogTitle>Suggest a meal</DialogTitle>
          <DialogDescription>
            {step === "ingredients"
              ? "Start with anything you want to use up — or skip if nothing comes to mind."
              : step === "vibes"
                ? "Pick a mood — or skip and let us surprise you."
                : step === "preferences"
                  ? "Set any hard nos, then we'll suggest one real dinner."
                  : "Like it? We'll draft the full recipe."}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollBodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5"
        >
        {!aiEnabled ? (
          <p className="text-sm text-muted-foreground">
            AI isn’t configured. Add OPENAI_API_KEY on the server to enable
            this.
          </p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {step === "ingredients" ? (
              <div className="space-y-4">
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    What should we use up this week?
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Tap common items, type your own, or skip if you don&apos;t
                    care.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      aria-pressed={ingredientsSkipped}
                      onClick={() => {
                        setIngredientsSkipped(true);
                        setSelectedIngredients([]);
                        setCustomIngredientsInput("");
                      }}
                      className={cn(
                        "min-h-9 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50",
                        ingredientsSkipped
                          ? "border-primary bg-accent text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {SKIP_INGREDIENTS_LABEL}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MEAL_IDEA_INGREDIENT_CHIPS.map((chip) => {
                      const active = selectedIngredients.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          disabled={pending}
                          aria-pressed={active}
                          onClick={() => {
                            setIngredientsSkipped(false);
                            setSelectedIngredients((prev) =>
                              toggleChipSelection(prev, chip),
                            );
                          }}
                          className={cn(
                            "min-h-9 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50",
                            active
                              ? "border-primary bg-accent text-foreground"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="meal-idea-custom-ingredients"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Or type your own
                    </label>
                    <Input
                      id="meal-idea-custom-ingredients"
                      value={customIngredientsInput}
                      disabled={pending}
                      placeholder="leftover steak, cherry tomatoes…"
                      onChange={(event) => {
                        const next = event.target.value;
                        setCustomIngredientsInput(next);
                        if (next.trim()) setIngredientsSkipped(false);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate multiple items with commas.
                    </p>
                  </div>
                </fieldset>
                <Button
                  type="button"
                  className="w-full"
                  disabled={pending}
                  onClick={() => setStep("vibes")}
                >
                  Continue
                </Button>
              </div>
            ) : null}

            {step === "vibes" ? (
              <div className="space-y-4">
                {effectiveIngredients.length ? (
                  <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Using: {effectiveIngredients.join(", ")}
                  </p>
                ) : (
                  <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    No ingredients flagged — we&apos;ll pick freely.
                  </p>
                )}

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">
                    What sounds good?
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Tap a mood that fits — or skip if you&apos;re open to
                    anything.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      aria-pressed={vibesSkipped}
                      onClick={() => {
                        setVibesSkipped(true);
                        setSelectedVibes([]);
                      }}
                      className={cn(
                        "min-h-9 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50",
                        vibesSkipped
                          ? "border-primary bg-accent text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {SKIP_VIBES_LABEL}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MEAL_IDEA_VIBE_CHIPS.map((chip) => {
                      const active = selectedVibes.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          disabled={pending}
                          aria-pressed={active}
                          onClick={() => {
                            setVibesSkipped(false);
                            setSelectedVibes((prev) =>
                              toggleChipSelection(prev, chip),
                            );
                          }}
                          className={cn(
                            "min-h-9 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50",
                            active
                              ? "border-primary bg-accent text-foreground"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:flex-1"
                    disabled={pending}
                    onClick={() => setStep("ingredients")}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="sm:flex-[2]"
                    disabled={pending}
                    onClick={() => setStep("preferences")}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "preferences" ? (
              <div className="space-y-4">
                {effectiveIngredients.length ? (
                  <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Using: {effectiveIngredients.join(", ")}
                  </p>
                ) : (
                  <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    No ingredients flagged — we&apos;ll pick freely.
                  </p>
                )}
                {selectedVibes.length ? (
                  <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Mood: {selectedVibes.join(", ")}
                  </p>
                ) : (
                  <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    No mood picked — we&apos;ll mix it up.
                  </p>
                )}
                {effectiveExclusions.length ? (
                  <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Excluding: {effectiveExclusions.join(", ")}
                  </p>
                ) : null}

                <div className="grid gap-4">
                  <ChipFieldset
                    legend="Skip these"
                    hint="Hard no's for this suggestion"
                    chips={MEAL_IDEA_EXCLUSION_CHIPS}
                    selected={selectedExclusions}
                    onToggle={(chip) =>
                      setSelectedExclusions((prev) =>
                        toggleChipSelection(prev, chip),
                      )
                    }
                    disabled={pending}
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="meal-idea-custom-exclusions"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Or type other exclusions
                    </label>
                    <Input
                      id="meal-idea-custom-exclusions"
                      value={customExclusionsInput}
                      disabled={pending}
                      placeholder="mushrooms, cilantro…"
                      onChange={(event) =>
                        setCustomExclusionsInput(event.target.value)
                      }
                    />
                  </div>
                  <ChipFieldset
                    legend="Cuisines"
                    hint="Leave blank for a mix"
                    chips={MEAL_IDEA_CUISINE_CHIPS}
                    selected={selectedCuisines}
                    onToggle={(chip) =>
                      setSelectedCuisines((prev) => toggleChipSelection(prev, chip))
                    }
                    disabled={pending}
                  />
                  {members.length ? (
                    <EatingPills
                      members={members}
                      value={eatingScope}
                      onChange={setEatingScope}
                      disabled={pending}
                    />
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:flex-1"
                    disabled={pending}
                    onClick={() => setStep("vibes")}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="sm:flex-[2]"
                    disabled={pending}
                    onClick={() => generate()}
                  >
                    {pending ? "Generating…" : "Suggest a meal"}
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "results" ? (
              <>
            {!ideas.length ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No suggestion yet. Head back and try again.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => resetWizard()}
                >
                  Start over
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {ideas.map((idea) => {
                  const recipe = recipes[idea.id];
                  const rejected = idea.status === "rejected";
                  const making = busyIdeaId === idea.id;
                  return (
                    <li
                      key={idea.id}
                      className={cn(
                        "rounded-xl border border-border px-3 py-3",
                        rejected && "opacity-60",
                      )}
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{idea.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {idea.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {idea.cuisine} · {idea.difficulty} ·{" "}
                          {idea.prep_time_minutes ?? "?"}m prep ·{" "}
                          {idea.cook_time_minutes ?? "?"}m cook ·{" "}
                          {idea.primary_protein}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(idea.ingredient_preview ?? []).join(", ")}
                        </p>
                        {idea.fit_reason ? (
                          <p className="text-xs">{idea.fit_reason}</p>
                        ) : null}
                      </div>

                      {recipe ? (
                        <div className="mt-3 space-y-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                          <p className="font-medium">{recipe.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatPortionsLabel(DEFAULT_COOK_PORTIONS)} ·{" "}
                            {recipe.prepTimeMinutes}m prep ·{" "}
                            {recipe.cookTimeMinutes}m cook
                          </p>
                          {confirmRegenId === idea.id ? (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button
                                type="button"
                                size="sm"
                                disabled={pending}
                                onClick={() => generateRecipe(idea.id, true)}
                              >
                                Redo recipe
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmRegenId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-1"
                              disabled={pending || making}
                              onClick={() => setConfirmRegenId(idea.id)}
                            >
                              Redo recipe
                            </Button>
                          )}
                          {days.length ? (
                            <fieldset className="pt-2">
                              <legend className="text-xs font-medium text-muted-foreground">
                                Add to day
                              </legend>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {days.map((day) => {
                                  const dayDate = toDateOnlyString(day.day_date);
                                  const date = new Date(`${dayDate}T12:00:00`);
                                  return (
                                    <button
                                      key={day.id}
                                      type="button"
                                      disabled={pending}
                                      onClick={() => addToWeek(idea, day.id)}
                                      className={cn(
                                        "min-h-9 shrink-0 rounded-xl bg-secondary/90 px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors",
                                        "hover:bg-secondary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
                                      )}
                                    >
                                      {format(date, "EEE MMM d")}
                                    </button>
                                  );
                                })}
                              </div>
                            </fieldset>
                          ) : null}
                        </div>
                      ) : rejected ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => generate({ replaceIdeaId: idea.id })}
                          >
                            Try another
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending || making}
                            onClick={() => acceptIdea(idea.id)}
                          >
                            {making ? "Making recipe…" : "Make this"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending || making}
                            onClick={() => rejectIdea(idea.id)}
                          >
                            Nope
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending || making}
                            onClick={() => generate({ replaceIdeaId: idea.id })}
                          >
                            Try another
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
              </>
            ) : null}
          </div>
        )}
        </div>

        {step === "results" && ideas.length ? (
          <DialogFooter className="shrink-0 border-t border-border/70 px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => resetWizard()}
            >
              Start over
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
