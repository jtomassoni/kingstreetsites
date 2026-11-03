"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  addShowAction,
  listShowsAction,
  removeShowAction,
  searchShowsAction,
  setShowStatusAction,
  syncAllSchedulesAction,
  syncShowScheduleAction,
  updateShowScheduleAction,
} from "@movies/actions/shows";
import {
  calendarDayThisWeek,
  formatWatchingAirLine,
} from "@movies/lib/airing";
import type { TvMazeSearchHit } from "@movies/lib/tvmaze";
import {
  formatTime12h,
  HOUSEHOLD_TIMEZONE,
  shortTimezoneLabel,
  todayWeekday,
  WEEKDAYS,
  type Weekday,
} from "@movies/lib/timezone";
import type { WatchingShow } from "@movies/types";

type Props = {
  initialShows: WatchingShow[];
  timezoneLabel: string;
};

export function WatchingApp({ initialShows, timezoneLabel }: Props) {
  const [shows, setShows] = useState(initialShows);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TvMazeSearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<TvMazeSearchHit | null>(null);
  const [airDays, setAirDays] = useState<Weekday[]>([]);
  const [airTime, setAirTime] = useState("");
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();

  const today = todayWeekday();
  const todayColRef = useRef<HTMLDivElement | null>(null);
  const tz = timezoneLabel || shortTimezoneLabel(HOUSEHOLD_TIMEZONE);

  useEffect(() => {
    todayColRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "auto",
    });
  }, [today]);
  const listedTvmazeIds = useMemo(
    () =>
      new Set(
        shows
          .map((s) => s.tvmaze_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    [shows],
  );
  const onCalendar = useMemo(
    () => shows.filter((s) => s.currently_airing),
    [shows],
  );
  const offCalendar = useMemo(
    () => shows.filter((s) => !s.currently_airing),
    [shows],
  );
  const onThisWeek = useMemo(
    () =>
      onCalendar.filter((s) => calendarDayThisWeek(s.next_air_at) !== null),
    [onCalendar],
  );

  const byDay = useMemo(() => {
    const map = Object.fromEntries(
      WEEKDAYS.map((d) => [d, [] as WatchingShow[]]),
    ) as Record<Weekday, WatchingShow[]>;
    for (const show of onThisWeek) {
      const day = calendarDayThisWeek(show.next_air_at);
      if (day) map[day].push(show);
    }
    for (const day of WEEKDAYS) {
      map[day].sort((a, b) =>
        (a.air_time_local || "99:99").localeCompare(b.air_time_local || "99:99"),
      );
    }
    return map;
  }, [onThisWeek]);

  const onToday = byDay[today];

  function submitSearch(e?: FormEvent) {
    e?.preventDefault();
    const value = query.trim();
    setError(null);
    setSelected(null);
    setMessage(null);
    if (value.length < 2) {
      setHits([]);
      setSearched(false);
      setError("Type at least 2 characters, then press Search.");
      return;
    }
    startSearch(async () => {
      const res = await searchShowsAction(value);
      setSearched(true);
      if (res.error) {
        setError(res.error);
        setHits([]);
        return;
      }
      setHits(res.results ?? []);
    });
  }

  function pickHit(hit: TvMazeSearchHit) {
    if (listedTvmazeIds.has(hit.tvmazeId)) {
      setError(`${hit.title} is already on your list.`);
      setSelected(null);
      return;
    }
    if (!hit.currentlyAiring) {
      setError(
        `${hit.title} isn’t airing right now — it can’t be added to the calendar.`,
      );
      setSelected(null);
      return;
    }
    setSelected(hit);
    setAirDays(hit.mountain.days);
    setAirTime(hit.mountain.time ?? "");
    setNotes("");
    setManual(false);
    setMessage(null);
    setError(null);
  }

  function addHit(hit: TvMazeSearchHit, opts?: { manual?: boolean }) {
    if (listedTvmazeIds.has(hit.tvmazeId)) {
      setError(`${hit.title} is already on your list.`);
      return;
    }
    if (!hit.currentlyAiring) {
      setError(
        `${hit.title} isn’t airing right now — it can’t be added to the calendar.`,
      );
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await addShowAction({
        tvmazeId: hit.tvmazeId,
        title: hit.title,
        imageUrl: hit.imageUrl,
        network: hit.network,
        summary: hit.summary,
        manualSchedule: opts?.manual ?? false,
        airDays: opts?.manual ? airDays : hit.mountain.days,
        airTimeLocal: opts?.manual ? airTime || null : hit.mountain.time,
        sourceTimezone: hit.source.timezone,
        notes: notes || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.show) {
        setShows((prev) => {
          if (prev.some((s) => s.id === res.show!.id)) return prev;
          return [...prev, res.show!];
        });
        const auto =
          res.show.air_days.length || res.show.air_time_local
            ? `${res.show.air_days.map((d) => d.slice(0, 3)).join(", ")} · ${formatTime12h(res.show.air_time_local)} ${tz}`
            : `no fixed night yet`;
        setMessage(`Added ${res.show.title} — ${auto}`);
        setSelected(null);
        setHits([]);
        setSearched(false);
        setQuery("");
        setAirDays([]);
        setAirTime("");
        setNotes("");
        setManual(false);
      }
    });
  }

  function syncOne(id: string) {
    startTransition(async () => {
      const res = await syncShowScheduleAction(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.show) {
        setShows((prev) => prev.map((s) => (s.id === id ? res.show! : s)));
        setMessage(
          res.show.currently_airing
            ? `Updated ${res.show.title}${res.label ? ` → ${res.label}` : ""}`
            : `${res.show.title} isn’t airing — off the calendar (${res.label ?? "between seasons"}).`,
        );
      }
    });
  }

  function syncAll() {
    startTransition(async () => {
      const res = await syncAllSchedulesAction();
      if (res.error) {
        setError(res.error);
        return;
      }
      const refreshed = await listShowsAction(["watching"]);
      if (refreshed.shows) setShows(refreshed.shows);
      setMessage(
        `Synced: ${res.updated ?? 0} updated` +
          (res.offCalendar
            ? `, ${res.offCalendar} off calendar`
            : "") +
          (res.skipped ? `, ${res.skipped} skipped` : "") +
          ".",
      );
    });
  }

  function markStatus(id: string, status: WatchingShow["status"]) {
    startTransition(async () => {
      const res = await setShowStatusAction({ id, status });
      if (res.error) {
        setError(res.error);
        return;
      }
      setShows((prev) =>
        status === "watching"
          ? res.show
            ? [...prev.filter((s) => s.id !== id), res.show]
            : prev
          : prev.filter((s) => s.id !== id),
      );
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeShowAction(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setShows((prev) => prev.filter((s) => s.id !== id));
    });
  }

  function saveSchedule(show: WatchingShow, days: Weekday[], time: string) {
    startTransition(async () => {
      const res = await updateShowScheduleAction({
        id: show.id,
        airDays: days,
        airTimeLocal: time || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.show) {
        setShows((prev) => prev.map((s) => (s.id === show.id ? res.show! : s)));
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-3 pb-10 pt-5 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand sm:text-sm">
            Movie List
          </p>
          <h1 className="mt-1 font-serif text-[1.85rem] leading-tight tracking-tight text-ink sm:mt-2 sm:text-5xl">
            What we&apos;re watching
          </h1>
          <p className="mt-2 text-sm text-ink-muted sm:mt-3 sm:text-lg">
            Next episodes only · times in{" "}
            <span className="font-medium text-ink">{tz}</span>
          </p>
        </div>
        <button
          type="button"
          disabled={pending || shows.length === 0}
          onClick={syncAll}
          className="w-full shrink-0 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink hover:bg-cream disabled:opacity-50 sm:w-auto sm:py-2.5"
        >
          {pending ? "Working…" : "Sync all"}
        </button>
      </header>

      {(error || message) && (
        <div
          className={`mt-4 rounded-xl border px-3 py-2.5 text-sm sm:mt-6 sm:px-4 sm:py-3 ${
            error
              ? "border-accent-rose/30 bg-accent-rose/5 text-accent-rose"
              : "border-brand/25 bg-brand/5 text-brand-dark"
          }`}
          role="status"
        >
          {error || message}
        </div>
      )}

      {onToday.length > 0 ? (
        <section className="mt-6 sm:mt-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
              On today
            </h2>
            <p className="shrink-0 text-xs text-ink-muted sm:text-sm">
              {today.slice(0, 3)} · {tz}
            </p>
          </div>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            {onToday.map((show) => (
              <li key={`today-${show.id}`}>
                <div className="flex gap-3 rounded-2xl border border-brand/30 bg-brand/[0.07] p-3 shadow-sm sm:gap-4 sm:p-4">
                  {show.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={show.image_url}
                      alt=""
                      className="h-[5.5rem] w-[3.9rem] shrink-0 rounded-lg object-cover sm:h-28 sm:w-20"
                    />
                  ) : (
                    <span className="flex h-[5.5rem] w-[3.9rem] shrink-0 items-center justify-center rounded-lg bg-cream-dark text-xs text-ink-faint sm:h-28 sm:w-20">
                      TV
                    </span>
                  )}
                  <div className="min-w-0 flex-1 self-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-dark">
                      Airs today
                    </p>
                    <p className="mt-1 font-serif text-xl leading-snug tracking-tight text-ink sm:text-2xl">
                      {show.title}
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-brand-dark">
                      {formatTime12h(show.air_time_local)} {tz}
                    </p>
                    {show.network ? (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {show.network}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-7 sm:mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
            This week
          </h2>
          <p className="shrink-0 text-xs text-ink-muted sm:text-sm">
            {onToday.length === 0 ? `${today.slice(0, 3)} · ` : ""}
            {tz}
            {offCalendar.length > 0 ? ` · ${offCalendar.length} hidden` : ""}
          </p>
        </div>

        {/* Mobile: snap-scroll strip. Desktop: 7-col grid. */}
        <div className="-mx-3 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:mt-4 sm:grid sm:grid-cols-7 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 sm:[-ms-overflow-style:auto] sm:[scrollbar-width:auto] [&::-webkit-scrollbar]:hidden sm:[&::-webkit-scrollbar]:block">
          {WEEKDAYS.map((day) => {
            const items = byDay[day];
            const isToday = day === today;
            return (
              <div
                key={day}
                ref={isToday ? todayColRef : undefined}
                className={`w-[30%] min-w-[5.25rem] max-w-[7rem] shrink-0 snap-center rounded-2xl border p-2 sm:w-auto sm:min-w-0 sm:max-w-none sm:min-h-[8.5rem] sm:snap-align-none sm:p-3 ${
                  isToday
                    ? "border-brand/35 bg-brand/[0.06] shadow-sm"
                    : "border-ink/[0.06] bg-white"
                }`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide sm:text-xs ${
                    isToday ? "text-brand-dark" : "text-ink-faint"
                  }`}
                >
                  {day.slice(0, 3)}
                  {isToday ? " · today" : ""}
                </p>
                <ul className="mt-1.5 space-y-1.5 sm:mt-2 sm:space-y-2">
                  {items.length === 0 ? (
                    <li className="text-xs text-ink-faint">—</li>
                  ) : (
                    items.map((show) => (
                      <li key={`${day}-${show.id}`} className="text-sm">
                        <p className="line-clamp-2 font-medium leading-snug text-ink">
                          {show.title}
                        </p>
                        <p className="text-[11px] text-ink-muted sm:text-xs">
                          {formatTime12h(show.air_time_local)} {tz}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-6 sm:mt-12 sm:gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Add first on mobile — primary action */}
        <div className="order-1 rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-sm sm:p-5 lg:order-2">
          <h2 className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
            Add a show
          </h2>
          <p className="mt-1 text-xs text-ink-muted sm:text-sm">
            Type the title, then Search. Only airing shows can be added.
          </p>

          <form
            className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row"
            onSubmit={submitSearch}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Show title</span>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearched(false);
                  setHits([]);
                  setSelected(null);
                }}
                placeholder="e.g. The Line"
                enterKeyHint="search"
                className="w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-3 text-base text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2 sm:py-2.5 sm:text-sm"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <button
              type="submit"
              disabled={searching || query.trim().length < 2}
              className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:shrink-0 sm:py-2.5"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {searched && !searching && hits.length === 0 && (
            <p className="mt-3 text-sm text-ink-muted">
              No airing matches for “{query.trim()}”. Try the exact show title.
            </p>
          )}

          {hits.length > 0 && (
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain sm:max-h-80">
              {hits.map((hit) => {
                const alreadyListed = listedTvmazeIds.has(hit.tvmazeId);
                const airing = hit.currentlyAiring;
                const inactive = alreadyListed || !airing;
                return (
                  <li
                    key={hit.tvmazeId}
                    className={`rounded-xl border px-2.5 py-2.5 ${
                      inactive
                        ? "border-ink/[0.04] bg-cream/60 opacity-90"
                        : selected?.tvmazeId === hit.tvmazeId
                          ? "border-brand/30 bg-brand/[0.04]"
                          : "border-ink/[0.06] bg-cream/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      {hit.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hit.imageUrl}
                          alt=""
                          className={`h-14 w-10 shrink-0 rounded object-cover ${inactive ? "grayscale" : ""}`}
                        />
                      ) : (
                        <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-cream-dark text-xs text-ink-faint">
                          TV
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium leading-snug text-ink sm:text-base">
                            {hit.title}
                          </p>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              alreadyListed
                                ? "bg-ink/5 text-ink-muted"
                                : airing
                                  ? "bg-brand/10 text-brand-dark"
                                  : "bg-ink/5 text-ink-muted"
                            }`}
                          >
                            {alreadyListed
                              ? "On list"
                              : airing
                                ? "Airing"
                                : "Not airing"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {[hit.network, hit.status].filter(Boolean).join(" · ")}
                        </p>
                        <p
                          className={`mt-0.5 text-xs font-medium ${
                            !inactive ? "text-brand-dark" : "text-ink-muted"
                          }`}
                        >
                          {hit.airingLabel}
                          {!inactive && hit.mountain.label
                            ? ` · ${hit.mountain.label}`
                            : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {alreadyListed ? (
                            <p className="text-xs text-ink-faint">Already listed</p>
                          ) : airing ? (
                            <>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => addHit(hit)}
                                className="min-h-9 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => pickHit(hit)}
                                className="min-h-9 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-white"
                              >
                                Adjust
                              </button>
                            </>
                          ) : (
                            <p className="text-xs text-ink-faint">
                              Can&apos;t add until new episodes are scheduled.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {selected &&
            selected.currentlyAiring &&
            !listedTvmazeIds.has(selected.tvmazeId) && (
              <div className="mt-4 space-y-3 border-t border-ink/[0.06] pt-4 sm:mt-5 sm:space-y-4 sm:pt-5">
                <div>
                  <p className="font-medium text-ink">{selected.title}</p>
                  <p className="text-xs text-brand-dark">
                    {selected.airingLabel}
                    {selected.mountain.label
                      ? ` · ${selected.mountain.label}`
                      : ""}
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={manual}
                    onChange={(e) => setManual(e.target.checked)}
                    className="rounded border-ink/20"
                  />
                  Override auto time
                </label>

                {manual && (
                  <>
                    <fieldset>
                      <legend className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                        Nights ({tz})
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((day) => {
                          const on = airDays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() =>
                                setAirDays((prev) =>
                                  prev.includes(day)
                                    ? prev.filter((d) => d !== day)
                                    : [...prev, day],
                                )
                              }
                              className={`min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                                on
                                  ? "bg-brand text-white"
                                  : "bg-cream text-ink-muted hover:bg-cream-dark"
                              }`}
                            >
                              {day.slice(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                        Air time ({tz})
                      </span>
                      <input
                        type="time"
                        value={airTime}
                        onChange={(e) => setAirTime(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-3 text-base text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/30 sm:py-2.5 sm:text-sm"
                      />
                    </label>
                  </>
                )}

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Notes
                  </span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="optional"
                    className="mt-2 w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-3 text-base text-ink outline-none placeholder:text-ink-faint focus:border-brand/40 focus:ring-2 focus:ring-brand/30 sm:py-2.5 sm:text-sm"
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => addHit(selected, { manual })}
                    className="min-h-11 flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:flex-none"
                  >
                    {pending ? "Saving…" : "Add to calendar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="min-h-11 rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-cream"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
        </div>

        <div className="order-2 lg:order-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-xl tracking-tight text-ink sm:text-2xl">
              Now watching
            </h2>
            <p className="shrink-0 text-xs text-ink-muted sm:text-sm">
              {shows.length === 0
                ? "Empty"
                : `${onThisWeek.length} this week` +
                  (onCalendar.length > onThisWeek.length
                    ? ` · ${onCalendar.length - onThisWeek.length} later`
                    : "") +
                  (offCalendar.length ? ` · ${offCalendar.length} off` : "")}
            </p>
          </div>

          <ul className="mt-3 space-y-2.5 sm:mt-5 sm:space-y-3">
            {shows.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-ink/10 px-4 py-6 text-center text-sm text-ink-muted">
                Nothing saved yet — search above for a show that’s on.
              </li>
            ) : (
              shows.map((show) => (
                <ShowRow
                  key={show.id}
                  show={show}
                  tz={tz}
                  pending={pending}
                  onStatus={(status) => markStatus(show.id, status)}
                  onRemove={() => remove(show.id)}
                  onSync={() => syncOne(show.id)}
                  onSaveSchedule={(days, time) => saveSchedule(show, days, time)}
                />
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

function ShowRow({
  show,
  tz,
  pending,
  onStatus,
  onRemove,
  onSync,
  onSaveSchedule,
}: {
  show: WatchingShow;
  tz: string;
  pending: boolean;
  onStatus: (status: WatchingShow["status"]) => void;
  onRemove: () => void;
  onSync: () => void;
  onSaveSchedule: (days: Weekday[], time: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [days, setDays] = useState<Weekday[]>(show.air_days);
  const [time, setTime] = useState(show.air_time_local ?? "");
  const airing = show.currently_airing;
  const onThisWeek = airing && calendarDayThisWeek(show.next_air_at) !== null;
  const badge = !airing ? "Not airing" : onThisWeek ? "This week" : "Later";
  const airLine = airing
    ? formatWatchingAirLine({
        nextAirAt: show.next_air_at,
        airDays: show.air_days,
        airTimeLocal: show.air_time_local,
        timezoneLabel: tz,
      })
    : "Hidden until new episodes are scheduled";

  const btn =
    "min-h-10 flex-1 rounded-lg border border-ink/10 px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-cream disabled:opacity-50 sm:min-h-9 sm:flex-none";

  return (
    <li
      className={`rounded-2xl border p-3 sm:p-4 ${
        airing
          ? "border-ink/[0.06] bg-white"
          : "border-ink/[0.04] bg-cream/50"
      }`}
    >
      <div className="flex gap-2.5 sm:gap-3">
        {show.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={show.image_url}
            alt=""
            className={`h-14 w-10 shrink-0 rounded object-cover sm:h-16 sm:w-11 ${!airing ? "grayscale" : ""}`}
          />
        ) : (
          <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-cream-dark text-xs text-ink-faint sm:h-16 sm:w-11">
            TV
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium leading-snug text-ink sm:text-base">
              {show.title}
            </p>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                airing && onThisWeek
                  ? "bg-brand/10 text-brand-dark"
                  : "bg-ink/5 text-ink-muted"
              }`}
            >
              {badge}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-muted sm:text-xs">
            {[show.network, show.tv_status, show.notes]
              .filter(Boolean)
              .join(" · ") || " "}
          </p>
          <p
            className={`mt-1 text-xs leading-snug sm:text-sm ${
              airing ? "text-brand-dark" : "text-ink-muted"
            }`}
          >
            {airLine}
          </p>

          {editing && airing ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const on = days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setDays((prev) =>
                          prev.includes(day)
                            ? prev.filter((d) => d !== day)
                            : [...prev, day],
                        )
                      }
                      className={`min-h-10 rounded-lg px-2.5 py-1 text-xs font-medium sm:min-h-9 ${
                        on
                          ? "bg-brand text-white"
                          : "bg-cream text-ink-muted"
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-ink/10 bg-cream px-2.5 py-2.5 text-base sm:w-auto sm:py-2 sm:text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onSaveSchedule(days, time);
                    setEditing(false);
                  }}
                  className="min-h-10 flex-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white sm:min-h-9 sm:flex-none"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDays(show.air_days);
                    setTime(show.air_time_local ?? "");
                    setEditing(false);
                  }}
                  className="min-h-10 rounded-lg px-3 py-1.5 text-xs text-ink-muted sm:min-h-9"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2.5 space-y-1.5 sm:mt-3">
              <div className="flex gap-1.5 sm:flex-wrap sm:gap-2">
                {show.tvmaze_id ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={onSync}
                    className="min-h-10 flex-1 rounded-lg border border-brand/20 bg-brand/5 px-2.5 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand/10 sm:min-h-9 sm:flex-none"
                  >
                    Sync
                  </button>
                ) : null}
                {airing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className={btn}
                  >
                    Edit
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className={`${btn} sm:hidden`}
                  aria-expanded={menuOpen}
                >
                  {menuOpen ? "Less" : "More"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onStatus("paused")}
                  className={`${btn} hidden sm:inline-flex`}
                >
                  Pause
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onStatus("finished")}
                  className={`${btn} hidden sm:inline-flex`}
                >
                  Done
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={onRemove}
                  className="hidden min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-rose hover:bg-accent-rose/5 sm:inline-flex"
                >
                  Remove
                </button>
              </div>
              {menuOpen ? (
                <div className="flex gap-1.5 sm:hidden">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onStatus("paused")}
                    className={btn}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onStatus("finished")}
                    className={btn}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={onRemove}
                    className="min-h-10 flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-rose hover:bg-accent-rose/5"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
