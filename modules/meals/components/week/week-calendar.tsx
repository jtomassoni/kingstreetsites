"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarMealChip } from "@meals/components/week/calendar-meal-chip";
import { AddMealDialog } from "@meals/components/week/add-meal-dialog";
import {
  DayMealSection,
  mealIdsForDayExport,
  MEAL_ROWS,
} from "@meals/components/week/day-meal-section";
import { MobileMonthView } from "@meals/components/week/mobile-month-view";
import { WeekMobileChrome } from "@meals/components/week/week-mobile-chrome";
import { WeekMobileDayStrip } from "@meals/components/week/week-mobile-day-strip";
import { WeekSelectToolbar } from "@meals/components/week/week-select-toolbar";
import {
  fillWeekChromeInteractive,
  fillWeekChromeMuted,
  fillWeekInteractive,
  fillWeekReviewPadding,
  fillWeekSlotDimmed,
  proposalSlotKey,
  useFillWeekOptional,
} from "@meals/components/week/fill-week-context";
import { FillWeekProposalChip } from "@meals/components/week/fill-week-proposal-chip";
import { FillWeekAutoNav } from "@meals/components/week/fill-week-auto-nav";
import { useWeekBulk } from "@meals/components/week/week-bulk-context";
import type { PlanDay, PlannedMeal } from "@meals/types/database";
import type { MealType } from "@meals/types/database";
import { toDateOnlyString } from "@meals/lib/dates";
import { useHorizontalSwipe } from "@meals/lib/use-horizontal-swipe";
import {
  defaultDayDate,
  parseCalendarDate,
  parseMobileCalendarView,
  weekPathWithView,
} from "@meals/lib/week/calendar-view";
import { resolveAdjacentDayNavigation } from "@meals/lib/week/day-navigation";
import { cn } from "@meals/lib/utils";

type MemberOption = { id: string; name: string };
type RecipeOption = { id: string; title: string; mealTypes: string[] };

function mealsForSlot(
  meals: PlannedMeal[],
  planDayId: string,
  mealType: MealType,
) {
  return meals
    .filter((m) => m.plan_day_id === planDayId && m.meal_type === mealType)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function mealIdsForType(meals: PlannedMeal[], mealType: MealType) {
  return meals.filter((m) => m.meal_type === mealType).map((m) => m.id);
}

export function WeekCalendar({
  planId,
  weekStart,
  days,
  meals,
  members,
  recipes,
  nameById,
  aiEnabled = false,
  mobilePlanningSheet,
  mobilePlanningActions,
}: {
  planId: string;
  weekStart: string;
  days: PlanDay[];
  meals: PlannedMeal[];
  members: MemberOption[];
  recipes: RecipeOption[];
  nameById: Record<string, string>;
  aiEnabled?: boolean;
  /** Week navigator + view switcher — lives in the mobile calendar sheet. */
  mobilePlanningSheet?: React.ReactNode;
  /** Meal ideas, fill week, bulk menu — shown inline on mobile. */
  mobilePlanningActions?: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const view = parseMobileCalendarView(searchParams.get("view"));
  const dateParam = parseCalendarDate(searchParams.get("date"));
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const mealIdsKey = useMemo(
    () =>
      meals
        .map((meal) => meal.id)
        .sort()
        .join(","),
    [meals],
  );
  const daySectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dayChipRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const { selecting, toggleGroup } = useWeekBulk();
  const fillWeek = useFillWeekOptional();
  const fillReviewing = fillWeek?.reviewing ?? false;
  const visibleMeals = meals.filter((meal) => !removedIds.has(meal.id));
  const sortedDays = useMemo(
    () =>
      [...days].sort((a, b) =>
        toDateOnlyString(a.day_date).localeCompare(toDateOnlyString(b.day_date)),
      ),
    [days],
  );
  const dayIdsKey = sortedDays.map((day) => day.id).join(",");
  const dayOptions = sortedDays.map((day) => ({
    id: day.id,
    day_date: day.day_date,
  }));
  const dayDates = sortedDays.map((day) => toDateOnlyString(day.day_date));
  const today = format(new Date(), "yyyy-MM-dd");
  const activeDate = defaultDayDate(sortedDays, dateParam);
  const activeDay =
    sortedDays.find((day) => toDateOnlyString(day.day_date) === activeDate) ??
    sortedDays[0];

  useEffect(() => {
    setRemovedIds(new Set());
  }, [mealIdsKey]);

  useEffect(() => {
    if (!sortedDays.length) return;
    const nextDayId =
      sortedDays.find((day) => toDateOnlyString(day.day_date) === activeDate)
        ?.id ?? sortedDays[0]!.id;
    setActiveDayId(nextDayId);
  }, [sortedDays, activeDate]);

  useEffect(() => {
    if (view !== "week" || typeof IntersectionObserver === "undefined") return;
    const sections = dayIdsKey
      .split(",")
      .filter(Boolean)
      .map((id) => daySectionRefs.current.get(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        const top = visible[0]?.target;
        if (top instanceof HTMLElement && top.dataset.dayId) {
          setActiveDayId(top.dataset.dayId);
        }
      },
      {
        rootMargin: "-35% 0px -50% 0px",
        threshold: [0.15, 0.4],
      },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [dayIdsKey, visibleMeals.length, view]);

  useEffect(() => {
    if (view === "month" || !activeDayId) return;
    dayChipRefs.current.get(activeDayId)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeDayId, view]);

  function selectDay(dayId: string, date: string) {
    setActiveDayId(dayId);
    if (view === "day") {
      startTransition(() => {
        router.replace(
          weekPathWithView(weekStart, { view: "day", date }),
          { scroll: false },
        );
      });
      return;
    }
    daySectionRefs.current.get(dayId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const selectDayForFillWeek = useCallback(
    (dayId: string, date: string) => {
      setActiveDayId(dayId);
      startTransition(() => {
        router.replace(
          weekPathWithView(weekStart, { view: "day", date }),
          { scroll: false },
        );
      });
    },
    [weekStart, router],
  );

  const swipeAnchorDay =
    sortedDays.find((day) => day.id === activeDayId) ?? activeDay;
  const swipeAnchorDate = swipeAnchorDay
    ? toDateOnlyString(swipeAnchorDay.day_date)
    : activeDate;

  const navigateDayDelta = useCallback(
    (delta: -1 | 1) => {
      const next = resolveAdjacentDayNavigation({
        weekStart,
        sortedDays,
        activeDate: swipeAnchorDate,
        delta,
      });
      if (!next) return;

      if (next.kind === "cross-week") {
        startTransition(() => {
          router.push(
            weekPathWithView(next.weekStart, {
              view: view === "month" ? "day" : view,
              date: next.date,
            }),
          );
        });
        return;
      }

      selectDay(next.dayId, next.date);
    },
    [weekStart, sortedDays, swipeAnchorDate, view, router],
  );

  const swipeEnabled =
    !selecting && view !== "month" && Boolean(swipeAnchorDay);

  const daySwipe = useHorizontalSwipe({
    disabled: !swipeEnabled,
    onSwipeLeft: () => navigateDayDelta(1),
    onSwipeRight: () => navigateDayDelta(-1),
  });

  function onMealRemoved(mealId: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(mealId);
      return next;
    });
  }

  function onMealsRemoved(mealIds: string[]) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      for (const id of mealIds) next.add(id);
      return next;
    });
  }

  const sharedDayProps = {
    planId,
    visibleMeals,
    members,
    recipes,
    nameById,
    aiEnabled,
    dayOptions,
    today,
    onMealRemoved,
  };

  return (
    <div
      className={cn(
        fillWeekInteractive(fillReviewing),
        fillWeekReviewPadding(fillReviewing),
      )}
    >
      {fillReviewing ? (
        <FillWeekAutoNav
          sortedDays={sortedDays}
          activeDayId={activeDayId}
          onSelectDay={selectDayForFillWeek}
        />
      ) : null}
      {selecting ? (
        <div className="sticky top-0 z-30 -mx-3 mb-2 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-sm min-[400px]:-mx-4 min-[400px]:px-4 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
          <WeekSelectToolbar
            planId={planId}
            members={members}
            weekMeals={visibleMeals}
            visibleMealIds={visibleMeals.map((meal) => meal.id)}
            onRemoved={onMealsRemoved}
          />
        </div>
      ) : null}

      <div className={cn("md:hidden", isPending && "opacity-80")}>
        {mobilePlanningSheet ? (
          <div
            className={cn(
              fillWeekChromeMuted(fillReviewing),
              fillWeekChromeInteractive(fillReviewing),
            )}
          >
            <WeekMobileChrome
              weekStart={weekStart}
              sortedDays={sortedDays}
              visibleMeals={visibleMeals}
              activeDayId={activeDayId}
              onSelectDay={fillReviewing ? selectDayForFillWeek : selectDay}
            >
              {mobilePlanningSheet}
            </WeekMobileChrome>
          </div>
        ) : null}

        {mobilePlanningActions ? (
          <div className={cn("mt-2", fillWeekSlotDimmed(fillReviewing))}>
            {mobilePlanningActions}
          </div>
        ) : null}

        {view === "month" ? (
          <div className={fillWeekSlotDimmed(fillReviewing)}>
            <MobileMonthView
              weekStart={weekStart}
              anchorDate={activeDate}
              className="mt-2"
            />
          </div>
        ) : (
          <>
            {view === "week" ? (
              <div
                className={cn(
                  fillWeekChromeMuted(fillReviewing),
                  fillWeekChromeInteractive(fillReviewing),
                )}
              >
                <WeekMobileDayStrip
                  sortedDays={sortedDays}
                  visibleMeals={visibleMeals}
                  activeDayId={activeDayId}
                  today={today}
                  onSelectDay={fillReviewing ? selectDayForFillWeek : selectDay}
                  dayButtonRef={(dayId, el) => {
                    if (el) dayChipRefs.current.set(dayId, el);
                    else dayChipRefs.current.delete(dayId);
                  }}
                  sticky
                  className="mb-2 mt-2"
                />
              </div>
            ) : null}

            <div
              className={cn(
                "week-board-grid mt-2 touch-pan-y",
                view === "week" && "space-y-0 divide-y divide-border/70",
              )}
              {...daySwipe}
            >
              {view === "day" && activeDay ? (
                <DayMealSection
                  day={activeDay}
                  compactHeader
                  {...sharedDayProps}
                />
              ) : (
                sortedDays.map((day) => (
                  <DayMealSection
                    key={day.id}
                    day={day}
                    sectionRef={(el) => {
                      if (el) daySectionRefs.current.set(day.id, el);
                      else daySectionRefs.current.delete(day.id);
                    }}
                    {...sharedDayProps}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="week-board-grid hidden md:block">
        <div
          className="week-board-grid-inner"
          style={{
            display: "grid",
            gridTemplateColumns: `var(--week-row-label-w, 6.25rem) repeat(${sortedDays.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="week-corner" />
          {sortedDays.map((day) => {
            const dayDate = toDateOnlyString(day.day_date);
            const date = new Date(`${dayDate}T12:00:00`);
            const isToday = dayDate === today;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isWork =
              day.needs_portable_snacks || day.profile_type === "workday";
            const dayMealIds = mealIdsForDayExport(visibleMeals, day.id);
            const HeaderTag = selecting && dayMealIds.length ? "button" : "div";
            return (
              <HeaderTag
                key={day.id}
                type={HeaderTag === "button" ? "button" : undefined}
                onClick={
                  HeaderTag === "button"
                    ? () => toggleGroup(dayMealIds)
                    : undefined
                }
                aria-label={
                  HeaderTag === "button"
                    ? `Select meals on ${format(date, "EEEE")}`
                    : undefined
                }
                className={cn(
                  "week-col-header",
                  isToday && "week-col-header--today",
                  isWeekend && !isToday && "week-col-header--weekend",
                  HeaderTag === "button" &&
                    "cursor-pointer hover:bg-primary/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  fillWeekSlotDimmed(fillReviewing),
                )}
              >
                <span className="week-col-header-day">{format(date, "EEE")}</span>
                <span className="week-col-header-date">{format(date, "d")}</span>
                <span
                  className={cn(
                    "mt-1 block h-3.5 text-[10px] font-semibold uppercase tracking-wide",
                    isWork ? "text-primary/75" : "text-transparent",
                  )}
                >
                  {isWork ? "Work" : "."}
                </span>
              </HeaderTag>
            );
          })}

          {MEAL_ROWS.map((row) => {
            const rowMealIds = mealIdsForType(visibleMeals, row.type);
            const RowTag = selecting && rowMealIds.length ? "button" : "div";
            return (
              <div key={row.type} className="contents">
                <RowTag
                  type={RowTag === "button" ? "button" : undefined}
                  onClick={
                    RowTag === "button"
                      ? () => toggleGroup(rowMealIds)
                      : undefined
                  }
                  aria-label={
                    RowTag === "button" ? `Select all ${row.label}` : undefined
                  }
                  className={cn(
                    "week-row-label",
                    `week-row-label--${row.type}`,
                    row.rail,
                    RowTag === "button" &&
                      "cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    fillWeekSlotDimmed(fillReviewing),
                  )}
                >
                  <span className="week-row-label-rail" aria-hidden />
                  <span>{row.label}</span>
                </RowTag>
                {sortedDays.map((day) => {
                  const cellMeals = mealsForSlot(visibleMeals, day.id, row.type);
                  const dayDate = toDateOnlyString(day.day_date);
                  const date = new Date(`${dayDate}T12:00:00`);
                  const dayLabel = format(date, "EEE MMM d");
                  const isToday = dayDate === today;
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const filled = cellMeals.length > 0;
                  const proposal = fillReviewing
                    ? (fillWeek?.proposalBySlot.get(
                        proposalSlotKey(day.id, row.type),
                      ) ?? null)
                    : null;
                  const hasProposal = Boolean(proposal);

                  return (
                    <div
                      key={`${day.id}-${row.type}`}
                      className={cn(
                        "week-cell",
                        filled && "week-cell--filled",
                        isToday && "week-cell--today",
                        isWeekend && !isToday && "week-cell--weekend",
                        !filled && row.wash,
                        hasProposal && fillReviewing && "fill-week-interactive relative z-[1] ring-1 ring-inset ring-primary/20",
                        fillReviewing && !hasProposal && fillWeekSlotDimmed(true),
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-full flex-col",
                          filled ? "gap-1" : "",
                        )}
                      >
                        {filled ? (
                          <div className={fillWeekSlotDimmed(fillReviewing)}>
                            <div className="space-y-1.5">
                              {cellMeals.map((meal) => (
                                <CalendarMealChip
                                  key={meal.id}
                                  meal={meal}
                                  members={members}
                                  weekMeals={visibleMeals}
                                  aiEnabled={aiEnabled}
                                  onRemoved={onMealRemoved}
                                  memberName={
                                    meal.assigned_to_user_id
                                      ? nameById[meal.assigned_to_user_id]
                                      : null
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {hasProposal && proposal && fillWeek ? (
                          <FillWeekProposalChip
                            proposal={proposal}
                            disabled={fillWeek.pending}
                            onAccept={() => fillWeek.acceptProposal(proposal)}
                            onSuggestNew={() => fillWeek.suggestNew(proposal)}
                          />
                        ) : null}
                        {selecting || fillReviewing ? null : filled ? (
                          <AddMealDialog
                            planDayId={day.id}
                            weeklyPlanId={planId}
                            members={members}
                            recipes={recipes}
                            meals={visibleMeals}
                            mealType={row.type}
                            dayLabel={dayLabel}
                            slotLabel={row.label}
                            days={dayOptions}
                            variant="another"
                            triggerClassName="week-slot-add-another mt-auto"
                          />
                        ) : !hasProposal ? (
                          <AddMealDialog
                            planDayId={day.id}
                            weeklyPlanId={planId}
                            members={members}
                            recipes={recipes}
                            meals={visibleMeals}
                            mealType={row.type}
                            dayLabel={dayLabel}
                            slotLabel={row.label}
                            days={dayOptions}
                            variant="empty"
                            triggerClassName="week-slot-empty"
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
