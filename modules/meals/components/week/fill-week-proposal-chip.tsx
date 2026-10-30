"use client";

import type { NameProposal } from "@meals/lib/week/fill-slots";
import type { MealType } from "@meals/types/database";
import { cn } from "@meals/lib/utils";

const MEAL_ACCENT: Partial<Record<MealType, string>> = {
  breakfast:
    "border-l-[var(--meal-breakfast-rail)] bg-[var(--meal-breakfast-bg)]",
  lunch: "border-l-[var(--meal-lunch-rail)] bg-[var(--meal-lunch-bg)]",
  dinner: "border-l-[var(--meal-dinner-rail)] bg-[var(--meal-dinner-bg)]",
  snack_prep: "border-l-[var(--meal-snack-rail)] bg-[var(--meal-snack-bg)]",
};

export function FillWeekProposalChip({
  proposal,
  disabled,
  onAccept,
  onSuggestNew,
}: {
  proposal: NameProposal;
  disabled?: boolean;
  onAccept: () => void;
  onSuggestNew: () => void;
}) {
  return (
    <div
      className={cn(
        "fill-week-interactive relative z-[101] flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border/70 border-l-[3px] p-2.5 shadow-[0_1px_0_color-mix(in_srgb,white_42%,transparent)_inset]",
        MEAL_ACCENT[proposal.mealType],
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="line-clamp-2 text-[0.8125rem] font-semibold leading-snug tracking-tight text-foreground">
          {proposal.title}
        </p>
        <span className="self-start rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wider text-primary">
          Suggested
        </span>
      </div>
      <div
        className="flex overflow-hidden rounded-lg border border-border/80 bg-[color-mix(in_srgb,var(--background)_55%,var(--card)_45%)]"
        role="group"
        aria-label="Review suggestion"
      >
        <button
          type="button"
          className="min-h-9 flex-1 touch-manipulation border-none bg-primary px-2 py-1.5 text-[0.6875rem] font-semibold leading-tight text-primary-foreground transition-opacity active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 min-[400px]:min-h-[2.25rem] min-[400px]:text-xs"
          disabled={disabled}
          onClick={onAccept}
        >
          Add
        </button>
        <button
          type="button"
          className="min-h-9 flex-1 touch-manipulation border-l border-border/80 bg-transparent px-2 py-1.5 text-[0.6875rem] font-semibold leading-tight text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 min-[400px]:min-h-[2.25rem] min-[400px]:text-xs"
          disabled={disabled}
          onClick={onSuggestNew}
        >
          <span className="min-[400px]:hidden">New</span>
          <span className="hidden min-[400px]:inline">Try another</span>
        </button>
      </div>
    </div>
  );
}
