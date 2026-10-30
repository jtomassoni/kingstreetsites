"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  applyAcceptedWeekMeals,
  proposeWeekMealNames,
} from "@meals/actions/fill-week";
import type { NameProposal } from "@meals/lib/week/fill-slots";
import { Button } from "@meals/components/ui/button";
import { cn } from "@meals/lib/utils";

type FillWeekContextValue = {
  reviewing: boolean;
  pending: boolean;
  dayScope: boolean;
  proposals: NameProposal[];
  proposalBySlot: Map<string, NameProposal>;
  pendingCount: number;
  startReview: (scope?: { planDayId?: string }) => void;
  cancelReview: () => void;
  abortReview: () => void;
  acceptProposal: (proposal: NameProposal) => void;
  suggestNew: (proposal: NameProposal) => void;
  acceptAll: () => void;
  resetAll: () => void;
};

const FillWeekContext = createContext<FillWeekContextValue | null>(null);

export type FillWeekProposalsChangeHandler = (
  proposals: NameProposal[],
  context?: { lastPlanDayId?: string; initial?: boolean },
) => void;

const proposalsChangeRef: {
  current: FillWeekProposalsChangeHandler | null;
} = { current: null };

export function registerFillWeekProposalsHandler(
  handler: FillWeekProposalsChangeHandler | null,
) {
  proposalsChangeRef.current = handler;
}

function notifyProposalsChange(
  proposals: NameProposal[],
  context?: { lastPlanDayId?: string; initial?: boolean },
) {
  queueMicrotask(() => proposalsChangeRef.current?.(proposals, context));
}

export function proposalSlotKey(planDayId: string, mealType: string) {
  return `${planDayId}:${mealType}`;
}

export function FillWeekProvider({
  planId,
  children,
}: {
  planId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const [proposals, setProposals] = useState<NameProposal[]>([]);
  const [dayScope, setDayScope] = useState(false);
  const scopePlanDayIdRef = useRef<string | undefined>(undefined);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!reviewing) return;
    document.body.dataset.fillWeekReview = "";
    return () => {
      delete document.body.dataset.fillWeekReview;
    };
  }, [reviewing]);

  const proposalBySlot = useMemo(() => {
    const map = new Map<string, NameProposal>();
    for (const proposal of proposals) {
      map.set(proposalSlotKey(proposal.planDayId, proposal.mealType), proposal);
    }
    return map;
  }, [proposals]);

  const resetReview = useCallback(() => {
    setReviewing(false);
    setProposals([]);
    setDayScope(false);
    scopePlanDayIdRef.current = undefined;
  }, []);

  const finishIfEmpty = useCallback(
    (next: NameProposal[]) => {
      if (!next.length) {
        setReviewing(false);
      }
    },
    [],
  );

  const loadProposals = useCallback(
    (opts?: {
      replaceKeys?: string[];
      keep?: NameProposal[];
      avoidTitles?: string[];
      resetToast?: boolean;
    }) => {
      const isReroll = Boolean(opts?.replaceKeys?.length);
      start(async () => {
        const result = await proposeWeekMealNames({
          weeklyPlanId: planId,
          source: "library",
          planDayId: scopePlanDayIdRef.current,
          replaceKeys: opts?.replaceKeys,
          keep: opts?.keep,
          avoidTitles: opts?.avoidTitles,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.warning) toast.message(result.warning);
        const next = result.proposals ?? [];
        if (!next.length && result.appliedDefaults) {
          toast.success(
            `Added ${result.appliedDefaults} usual meal${result.appliedDefaults === 1 ? "" : "s"}`,
          );
          resetReview();
          router.refresh();
          return;
        }
        if (!next.length) {
          toast.message(
            scopePlanDayIdRef.current
              ? "No open slots on this day"
              : "No open slots to fill",
          );
          resetReview();
          return;
        }
        setProposals(next);
        setReviewing(true);
        notifyProposalsChange(next, { initial: true });
        if (isReroll) {
          toast.success(
            `New suggestion${opts!.replaceKeys!.length === 1 ? "" : "s"} ready`,
          );
        } else if (opts?.resetToast) {
          toast.success("Suggestions reset");
        }
      });
    },
    [planId, resetReview, router],
  );

  const startReview = useCallback(
    (scope?: { planDayId?: string }) => {
      if (pending) return;
      scopePlanDayIdRef.current = scope?.planDayId;
      setDayScope(Boolean(scope?.planDayId));
      loadProposals();
    },
    [pending, loadProposals],
  );

  const cancelReview = useCallback(() => {
    if (pending) return;
    resetReview();
  }, [pending, resetReview]);

  const abortReview = useCallback(() => {
    resetReview();
  }, [resetReview]);

  const acceptProposal = useCallback(
    (proposal: NameProposal) => {
      if (pending) return;
      start(async () => {
        const result = await applyAcceptedWeekMeals({
          weeklyPlanId: planId,
          accepted: [proposal],
          enforceMinUses: false,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`Added ${proposal.title}`);
        if (result.errors?.length) {
          toast.message("Note", {
            description: result.errors.slice(0, 2).join("; "),
          });
        }
        setProposals((prev) => {
          const next = prev.filter((item) => item.key !== proposal.key);
          finishIfEmpty(next);
          notifyProposalsChange(next, { lastPlanDayId: proposal.planDayId });
          return next;
        });
        router.refresh();
      });
    },
    [pending, planId, finishIfEmpty, router],
  );

  const suggestNew = useCallback(
    (proposal: NameProposal) => {
      if (pending) return;
      const keep = proposals.filter((item) => item.key !== proposal.key);
      loadProposals({
        replaceKeys: [proposal.key],
        keep,
        avoidTitles: [proposal.title],
      });
    },
    [pending, proposals, loadProposals],
  );

  const acceptAll = useCallback(() => {
    if (pending || !proposals.length) return;
    const batch = [...proposals];
    start(async () => {
      const result = await applyAcceptedWeekMeals({
        weeklyPlanId: planId,
        accepted: batch,
        enforceMinUses: false,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const placed = result.placed?.length ?? 0;
      toast.success(
        `Added ${placed} meal${placed === 1 ? "" : "s"} to the week`,
      );
      if (result.errors?.length) {
        toast.message("Some meals skipped", {
          description: result.errors.slice(0, 3).join("; "),
        });
      }
      resetReview();
      router.refresh();
    });
  }, [pending, proposals, planId, resetReview, router]);

  const resetAll = useCallback(() => {
    if (pending) return;
    loadProposals({ resetToast: true });
  }, [pending, loadProposals]);

  const value = useMemo<FillWeekContextValue>(
    () => ({
      reviewing,
      pending,
      dayScope,
      proposals,
      proposalBySlot,
      pendingCount: proposals.length,
      startReview,
      cancelReview,
      abortReview,
      acceptProposal,
      suggestNew,
      acceptAll,
      resetAll,
    }),
    [
      reviewing,
      pending,
      dayScope,
      proposals,
      proposalBySlot,
      startReview,
      cancelReview,
      abortReview,
      acceptProposal,
      suggestNew,
      acceptAll,
      resetAll,
    ],
  );

  return (
    <FillWeekContext.Provider value={value}>
      {children}
      {reviewing ? <FillWeekReviewLayer /> : null}
    </FillWeekContext.Provider>
  );
}

function FillWeekReviewLayer() {
  const {
    pending,
    pendingCount,
    dayScope,
    cancelReview,
    acceptAll,
    resetAll,
  } = useFillWeek();

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="pointer-events-none fixed inset-0 z-[200] bg-black/65 md:bg-black/45"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-[calc(3.25rem+env(safe-area-inset-top))] z-[210] flex justify-center px-4 md:top-5"
        aria-live="polite"
      >
        <div className="rounded-full border border-primary/35 bg-card/95 px-4 py-2 text-sm font-medium tabular-nums text-foreground shadow-lg backdrop-blur-md md:px-5 md:py-2.5 md:text-[0.9375rem]">
          {dayScope ? "Fill day" : "Fill week"}
          <span className="mx-1.5 text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className="font-semibold text-primary">
            {pendingCount} left
          </span>
        </div>
      </div>
      <div className="fill-week-interactive pointer-events-auto fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[210] border-t border-border/80 bg-card/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md md:bottom-5 md:left-1/2 md:w-full md:max-w-2xl md:-translate-x-1/2 md:rounded-2xl md:border md:border-border/70 md:px-5 md:py-3.5 md:shadow-[0_12px_40px_rgba(0,0,0,0.32)]">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5 md:max-w-none md:flex-row md:items-center md:justify-between md:gap-4">
          <p className="text-center text-sm tabular-nums text-muted-foreground md:text-left md:text-[0.9375rem]">
            {pendingCount === 1
              ? "1 meal left to review"
              : `${pendingCount} meals left to review`}
          </p>
          <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 touch-manipulation md:min-h-9 md:px-3"
              disabled={pending}
              onClick={resetAll}
            >
              Reset all
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-11 touch-manipulation md:min-h-9 md:px-4"
              disabled={pending || pendingCount === 0}
              onClick={acceptAll}
            >
              {pending ? "Adding…" : "Add all"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 touch-manipulation md:min-h-9 md:px-4"
              disabled={pending}
              onClick={cancelReview}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

export function useFillWeek() {
  const ctx = useContext(FillWeekContext);
  if (!ctx) {
    throw new Error("useFillWeek must be used within FillWeekProvider");
  }
  return ctx;
}

export function useFillWeekOptional() {
  return useContext(FillWeekContext);
}

export function useFillWeekProposal(
  planDayId: string,
  mealType: string,
): NameProposal | null {
  const ctx = useFillWeekOptional();
  if (!ctx?.reviewing) return null;
  return ctx.proposalBySlot.get(proposalSlotKey(planDayId, mealType)) ?? null;
}

export function fillWeekSlotDimmed(reviewing: boolean) {
  return cn(reviewing && "pointer-events-none opacity-40 saturate-50");
}

/** Dim fill-week chrome visually but keep it tappable (day nav, strip). */
export function fillWeekChromeMuted(reviewing: boolean) {
  return cn(reviewing && "opacity-80 saturate-90");
}

export function fillWeekChromeInteractive(reviewing: boolean) {
  return cn(reviewing && "fill-week-chrome-interactive fill-week-interactive relative");
}

export function fillWeekInteractive(reviewing: boolean) {
  return cn(reviewing && "fill-week-interactive relative");
}

export function fillWeekReviewPadding(reviewing: boolean) {
  return cn(reviewing && "pb-52 pt-12 md:pb-28 md:pt-16");
}
