"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addPlannedMeal, addRecipeSittings } from "@meals/actions/plans";
import {
  RecipeSearchPicker,
  type RecipeSearchOption,
} from "@meals/components/recipes/recipe-search-picker";
import { Button } from "@meals/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meals/components/ui/dialog";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import { cn } from "@meals/lib/utils";
import {
  MIN_CALENDAR_PORTIONS,
  NOT_ENOUGH_CALENDAR_PORTIONS_ERROR,
  calendarPortions,
  meetsMinCalendarPortions,
  sittingServings,
} from "@meals/lib/meals/appetite";
import { belowMinPortionsWarning } from "@meals/lib/meals/calendar-portions";
import { formatPortionsLabel } from "@meals/lib/recipes/display";
import { toDateOnlyString } from "@meals/lib/dates";
import {
  calendarSlotKey,
  mealNeedsMinCalendarPortions,
  parseCalendarSlotKey,
} from "@meals/lib/week/fill-slots";
import {
  buildDefaultMealSittings,
  occupiedCalendarSlotKeys,
  suggestAdditionalSittingSlot,
} from "@meals/lib/week/meal-sittings";
import { MEAL_TYPES } from "@meals/types/enums";
import type { MealType, PlannedMeal } from "@meals/types/database";

type RecipeOption = RecipeSearchOption;
type DayOption = { id: string; day_date: string };

type SittingDraft = {
  id: string;
  planDayId: string;
  mealType: string;
  assigned: string;
  locked: boolean;
};

/** Keep bottom sheets above the mobile keyboard on iOS/Android. */
function useMobileKeyboardOffset(active: boolean) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!active) {
      setOffset(0);
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const gap = window.innerHeight - viewport.height - viewport.offsetTop;
      setOffset(Math.max(0, Math.round(gap)));
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);

  return offset;
}

function assignmentScope(assigned: string): "both" | "specific" {
  return assigned === "both" ? "both" : "specific";
}

function slotLabelFor(days: DayOption[], planDayId: string, mealType: string) {
  const day = days.find((d) => d.id === planDayId);
  const dayDate = day ? toDateOnlyString(day.day_date) : "";
  const date = dayDate ? new Date(`${dayDate}T12:00:00`) : null;
  const mealLabel =
    MEAL_TYPES.find((t) => t.value === mealType)?.label ?? mealType;
  return date ? `${format(date, "EEE MMM d")} ${mealLabel}` : mealLabel;
}

function AssignmentPills({
  members,
  value,
  onChange,
  label,
}: {
  members: { id: string; name: string }[];
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const options = [
    { id: "both", label: "Both" },
    ...members.map((m) => ({
      id: m.id,
      label: m.name.split(" ")[0] || m.name,
    })),
  ];

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "min-h-9 rounded-lg px-3 text-sm font-medium transition-colors",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/80 text-secondary-foreground hover:bg-secondary",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AddMealFormBody({
  planDayId,
  weeklyPlanId,
  members,
  recipes,
  meals,
  mealType,
  days,
  onSuccess,
}: {
  planDayId: string;
  weeklyPlanId: string;
  members: { id: string; name: string }[];
  recipes: RecipeOption[];
  meals: Pick<PlannedMeal, "plan_day_id" | "meal_type">[];
  mealType: string;
  days: DayOption[];
  onSuccess: () => void;
}) {
  const router = useRouter();
  const needsMinPortions = mealNeedsMinCalendarPortions(mealType);
  const occupied = useMemo(
    () => occupiedCalendarSlotKeys(meals),
    [meals],
  );
  const [pending, start] = useTransition();
  const [recipeId, setRecipeId] = useState("");
  const [sittings, setSittings] = useState<SittingDraft[]>(() => {
    const defaults = buildDefaultMealSittings({
      planDayId,
      mealType: mealType as MealType,
      days,
      occupied,
    });
    return defaults.map((sitting, index) => ({
      id: index === 0 ? "origin" : `auto-${index}`,
      planDayId: sitting.planDayId,
      mealType: sitting.mealType,
      assigned: sitting.assigned === "specific" ? sitting.assigned : "both",
      locked: index === 0,
    }));
  });
  const [notesOpen, setNotesOpen] = useState(false);
  const searchId = useMemo(
    () => `add-meal-${planDayId}-${mealType}`,
    [planDayId, mealType],
  );

  const usedKeys = new Set(
    sittings.map((s) => calendarSlotKey(s.planDayId, s.mealType)),
  );
  const slotOptions = days.flatMap((day) => {
    const dayDate = toDateOnlyString(day.day_date);
    const date = new Date(`${dayDate}T12:00:00`);
    return MEAL_TYPES.filter((t) =>
      mealNeedsMinCalendarPortions(t.value),
    )
      .filter((t) => t.value === mealType)
      .map((t) => ({
        value: calendarSlotKey(day.id, t.value),
        label: `${format(date, "EEE MMM d")} ${t.label}`,
        occupied: occupied.has(calendarSlotKey(day.id, t.value)),
      }));
  });

  const scopes = sittings.map((s) => assignmentScope(s.assigned));
  const placed = calendarPortions(scopes);
  const enough = meetsMinCalendarPortions(scopes);

  function addSitting() {
    const originPlanDayId = sittings[0]?.planDayId ?? planDayId;
    const allOccupied = new Set([...occupied, ...usedKeys]);
    const next = suggestAdditionalSittingSlot({
      days,
      mealType: mealType as MealType,
      occupied: allOccupied,
      existingSittingPlanDayIds: sittings.map((s) => s.planDayId),
      preferPlanDayId: originPlanDayId,
    });
    if (!next) {
      toast.error("No more meal slots this week.");
      return;
    }
    setSittings((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        planDayId: next.planDayId,
        mealType: next.mealType,
        assigned: "both",
        locked: false,
      },
    ]);
  }

  function removeSitting(sittingId: string) {
    const remaining = sittings.filter((s) => s.id !== sittingId);
    if (needsMinPortions) {
      const warning = belowMinPortionsWarning(
        remaining.map((s) => assignmentScope(s.assigned)),
      );
      if (warning) toast.warning(warning);
    }
    setSittings(remaining);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!recipeId) {
          toast.error("Choose a recipe");
          return;
        }
        const fd = new FormData(e.currentTarget);
        const notes = String(fd.get("notes") || "") || null;
        const origin = sittings[0]!;
        const originScope = assignmentScope(origin.assigned);

        if (!needsMinPortions) {
          start(async () => {
            const result = await addPlannedMeal({
              planDayId,
              weeklyPlanId,
              recipeId,
              mealType: mealType as never,
              assignedTo: originScope,
              assignedToUserId:
                originScope === "both" ? null : origin.assigned,
              servings: sittingServings(originScope),
              notes,
            });
            if (result.error) toast.error(result.error);
            else {
              toast.success("Meal added");
              router.refresh();
              onSuccess();
            }
          });
          return;
        }

        if (!enough) {
          toast.error(NOT_ENOUGH_CALENDAR_PORTIONS_ERROR);
          return;
        }

        start(async () => {
          const result = await addRecipeSittings({
            weeklyPlanId,
            recipeId,
            notes,
            sittings: sittings.map((sitting) => {
              const scope = assignmentScope(sitting.assigned);
              return {
                planDayId: sitting.planDayId,
                mealType: sitting.mealType as never,
                assignedTo: scope,
                assignedToUserId: scope === "both" ? null : sitting.assigned,
              };
            }),
          });
          if (result.error) toast.error(result.error);
          else {
            toast.success("Recipe added to the week");
            router.refresh();
            onSuccess();
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={searchId} className="text-muted-foreground">
          What are you cooking?
        </Label>
        <RecipeSearchPicker
          id={searchId}
          recipes={recipes}
          mealType={mealType}
          value={recipeId}
          onChange={setRecipeId}
          suggestWhenEmpty
          autoFocus
          placeholder="Search or type a new dish…"
        />
      </div>

      {recipeId ? (
        <div className="space-y-4 border-t border-border/70 pt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <div className="space-y-3">
            {sittings.map((sitting, index) => (
              <div
                key={sitting.id}
                className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {sitting.locked
                      ? "This slot"
                      : `Also on the week · ${sittingServings(assignmentScope(sitting.assigned))} portions`}
                  </p>
                  {!sitting.locked && sittings.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => removeSitting(sitting.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {sitting.locked ? (
                  <p className="text-sm font-medium">
                    {slotLabelFor(days, sitting.planDayId, sitting.mealType)}
                  </p>
                ) : (
                  <select
                    value={calendarSlotKey(sitting.planDayId, sitting.mealType)}
                    onChange={(e) => {
                      const parsed = parseCalendarSlotKey(e.target.value);
                      if (!parsed) return;
                      setSittings((prev) =>
                        prev.map((s) =>
                          s.id === sitting.id
                            ? {
                                ...s,
                                planDayId: parsed.planDayId,
                                mealType: parsed.mealType,
                              }
                            : s,
                        ),
                      );
                    }}
                    className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    {slotOptions
                      .filter((opt) => {
                        const current = calendarSlotKey(
                          sitting.planDayId,
                          sitting.mealType,
                        );
                        return (
                          opt.value === current ||
                          (!usedKeys.has(opt.value) && !opt.occupied)
                        );
                      })
                      .map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                  </select>
                )}
                <AssignmentPills
                  members={members}
                  value={sitting.assigned}
                  onChange={(next) =>
                    setSittings((prev) =>
                      prev.map((s) =>
                        s.id === sitting.id ? { ...s, assigned: next } : s,
                      ),
                    )
                  }
                  label={
                    index === 0
                      ? "Who is this meal for"
                      : `Who is sitting ${index + 1} for`
                  }
                />
              </div>
            ))}
            {needsMinPortions ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={addSitting}
              >
                Add another sitting
              </Button>
            ) : null}
          </div>

          <div className="flex items-end gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {needsMinPortions
                ? `${formatPortionsLabel(placed)} of ${MIN_CALENDAR_PORTIONS} on the week${enough ? "." : " — add more sittings."}`
                : `Cooks ${formatPortionsLabel(sittingServings(assignmentScope(sittings[0]?.assigned ?? "both")))} for the shopping list.`}
            </p>
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="mb-0.5 shrink-0 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {notesOpen ? "Hide notes" : "Add notes"}
            </button>
          </div>

          {notesOpen ? (
            <div className="space-y-1.5 animate-in fade-in-0 duration-150">
              <Label
                htmlFor={`${searchId}-notes`}
                className="text-muted-foreground"
              >
                Notes
              </Label>
              <Input
                id={`${searchId}-notes`}
                name="notes"
                placeholder="Prep ahead…"
                className="min-h-11"
                autoFocus
              />
            </div>
          ) : (
            <input type="hidden" name="notes" value="" />
          )}

          <Button
            type="submit"
            disabled={pending || (needsMinPortions && !enough)}
            className="w-full"
          >
            {pending ? "Adding…" : "Add to calendar"}
          </Button>
        </div>
      ) : (
        <p className="pb-1 text-center text-xs text-muted-foreground">
          Pick a recipe, then assign at least {MIN_CALENDAR_PORTIONS} portions
          across the week.
        </p>
      )}
    </form>
  );
}

export function AddMealDialog({
  planDayId,
  weeklyPlanId,
  members,
  recipes,
  meals,
  mealType,
  dayLabel,
  slotLabel,
  days,
  triggerClassName,
  children,
  variant = "empty",
}: {
  planDayId: string;
  weeklyPlanId: string;
  members: { id: string; name: string }[];
  recipes: RecipeOption[];
  meals: Pick<PlannedMeal, "plan_day_id" | "meal_type">[];
  mealType: string;
  dayLabel: string;
  slotLabel: string;
  days: DayOption[];
  triggerClassName?: string;
  children?: React.ReactNode;
  /** empty = quiet full-slot CTA; another = subtle add-another row */
  variant?: "empty" | "another";
}) {
  const [open, setOpen] = useState(false);
  const keyboardOffset = useMobileKeyboardOffset(open);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName}>
          {children ??
            (variant === "another" ? (
              <>
                <Plus className="size-3.5 opacity-70" aria-hidden />
                <span>Add another</span>
              </>
            ) : (
              <>
                <span className="week-slot-empty-icon" aria-hidden>
                  <Plus className="size-4" strokeWidth={2.25} />
                </span>
                <span className="week-slot-empty-label">Add meal</span>
              </>
            ))}
        </button>
      </DialogTrigger>
      <DialogContent
        style={
          keyboardOffset > 0
            ? { bottom: `${keyboardOffset}px` }
            : undefined
        }
        className={cn(
          "flex max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md sm:p-0",
          "max-md:!fixed max-md:!inset-x-0 max-md:!bottom-0 max-md:!top-auto max-md:!left-0 max-md:!right-0",
          "max-md:!h-auto max-md:!w-full max-md:!max-w-none max-md:!translate-x-0 max-md:!translate-y-0",
          "max-md:max-h-[min(92dvh,42rem)] max-md:rounded-b-none max-md:rounded-t-2xl max-md:border-b-0",
          "max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          "md:max-h-[min(90dvh,40rem)]",
        )}
      >
        <div
          className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted md:hidden"
          aria-hidden
        />
        <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-3 text-left sm:px-6 sm:py-5">
          <DialogTitle className="font-display text-xl leading-snug">
            {slotLabel}
          </DialogTitle>
          <DialogDescription>{dayLabel}</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto overscroll-contain px-4 py-4 max-md:max-h-[calc(92dvh-6rem)] md:min-h-0 md:flex-1 sm:px-6 sm:py-5">
          {open ? (
            <AddMealFormBody
              key={`${planDayId}-${mealType}`}
              planDayId={planDayId}
              weeklyPlanId={weeklyPlanId}
              members={members}
              recipes={recipes}
              meals={meals}
              mealType={mealType}
              days={days}
              onSuccess={() => setOpen(false)}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
