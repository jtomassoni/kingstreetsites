"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_DAY_MEAL_NEEDS,
  MEAL_SLOTS,
  mealSlotLabel,
  parseDayMealNeeds,
  resolveMealsForDay,
  summarizeWorkingMods,
  type DayMealNeeds,
  type MealSlot,
} from "@meals/lib/meals/day-needs";
import { Label } from "@meals/components/ui/label";

function MealSlotChecks({
  name,
  value,
  onChange,
}: {
  name: string;
  value: MealSlot[];
  onChange: (next: MealSlot[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {MEAL_SLOTS.map((slot) => {
        const checked = value.includes(slot.value);
        return (
          <label key={`${name}-${slot.value}`} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={checked}
              onChange={(e) => {
                if (e.target.checked) onChange([...value, slot.value]);
                else onChange(value.filter((v) => v !== slot.value));
              }}
            />
            {slot.label}
          </label>
        );
      })}
    </div>
  );
}

export function DayMealNeedsFields({
  initial,
}: {
  initial?: unknown;
}) {
  const [needs, setNeeds] = useState<DayMealNeeds>(() =>
    parseDayMealNeeds(initial ?? DEFAULT_DAY_MEAL_NEEDS),
  );
  const [useWeekdayOverride, setUseWeekdayOverride] = useState(
    () => needs.weekdayMeals != null,
  );
  const [useWeekendOverride, setUseWeekendOverride] = useState(
    () => needs.weekendMeals != null,
  );

  const workingPreview = useMemo(() => {
    // Preview against a weekday date so weekday override (if any) applies.
    return resolveMealsForDay(needs, "2026-07-20", true);
  }, [needs]);

  const payload: DayMealNeeds = {
    defaultMeals: needs.defaultMeals,
    weekdayMeals: useWeekdayOverride ? needs.weekdayMeals ?? needs.defaultMeals : null,
    weekendMeals: useWeekendOverride ? needs.weekendMeals ?? needs.defaultMeals : null,
    workingDayMods: needs.workingDayMods,
  };

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card/60 p-3 min-[400px]:p-4">
      <input type="hidden" name="dayMealNeeds" value={JSON.stringify(payload)} />

      <div className="space-y-2">
        <Label>Default days</Label>
        <p className="text-xs text-muted-foreground">
          Meals you usually need planned when you are home.
        </p>
        <MealSlotChecks
          name="default"
          value={needs.defaultMeals}
          onChange={(defaultMeals) => setNeeds((n) => ({ ...n, defaultMeals }))}
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={useWeekdayOverride}
            onChange={(e) => {
              const on = e.target.checked;
              setUseWeekdayOverride(on);
              setNeeds((n) => ({
                ...n,
                weekdayMeals: on ? n.weekdayMeals ?? n.defaultMeals : null,
              }));
            }}
          />
          Different on weekdays
        </label>
        {useWeekdayOverride ? (
          <MealSlotChecks
            name="weekday"
            value={needs.weekdayMeals ?? needs.defaultMeals}
            onChange={(weekdayMeals) => setNeeds((n) => ({ ...n, weekdayMeals }))}
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={useWeekendOverride}
            onChange={(e) => {
              const on = e.target.checked;
              setUseWeekendOverride(on);
              setNeeds((n) => ({
                ...n,
                weekendMeals: on ? n.weekendMeals ?? n.defaultMeals : null,
              }));
            }}
          />
          Different on weekends
        </label>
        {useWeekendOverride ? (
          <MealSlotChecks
            name="weekend"
            value={needs.weekendMeals ?? needs.defaultMeals}
            onChange={(weekendMeals) => setNeeds((n) => ({ ...n, weekendMeals }))}
          />
        ) : null}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div>
          <Label>Needs mods for working days</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            When a day is marked &quot;at work&quot;, apply these changes to your
            default for that day. Example: remove lunch (work provides it) and
            dinner (eating out), or add snacks.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Add meals</p>
          <MealSlotChecks
            name="work-add"
            value={needs.workingDayMods.add}
            onChange={(add) =>
              setNeeds((n) => ({
                ...n,
                workingDayMods: { ...n.workingDayMods, add },
              }))
            }
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Remove meals</p>
          <MealSlotChecks
            name="work-remove"
            value={needs.workingDayMods.remove}
            onChange={(remove) =>
              setNeeds((n) => ({
                ...n,
                workingDayMods: { ...n.workingDayMods, remove },
              }))
            }
          />
        </div>

        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Working days: {summarizeWorkingMods(needs)} → need{" "}
          {workingPreview.length
            ? workingPreview.map(mealSlotLabel).join(", ")
            : "no meals"}
        </p>
      </div>
    </div>
  );
}
