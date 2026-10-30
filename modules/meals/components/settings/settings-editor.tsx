"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { updateProfile } from "@meals/actions/profile";
import { MealDefaultsFields } from "@meals/components/settings/meal-defaults-fields";
import type { MealDefaults } from "@meals/lib/meals/defaults";
import type { RecipeSearchOption } from "@meals/components/recipes/recipe-search-picker";

const SAVE_TOAST_ID = "settings-save";
const DEBOUNCE_MS = 500;

export function SettingsEditor({
  mealDefaults,
  recipes,
}: {
  mealDefaults: unknown;
  recipes: RecipeSearchOption[];
}) {
  const pendingRef = useRef<MealDefaults | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const flushAgainRef = useRef(false);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) {
      flushAgainRef.current = true;
      return;
    }
    const next = pendingRef.current;
    if (!next) return;

    pendingRef.current = null;
    inFlightRef.current = true;
    const result = await updateProfile({ mealDefaults: next });
    inFlightRef.current = false;

    if (result.error) {
      toast.error(result.error, { id: SAVE_TOAST_ID });
    } else {
      toast.dismiss(SAVE_TOAST_ID);
    }

    if (flushAgainRef.current || pendingRef.current) {
      flushAgainRef.current = false;
      await flush();
    }
  }, []);

  const schedule = useCallback(
    (next: MealDefaults) => {
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  return (
    <MealDefaultsFields
      className="md:min-h-0 md:flex-1"
      initial={mealDefaults}
      recipes={recipes}
      onChange={schedule}
    />
  );
}
