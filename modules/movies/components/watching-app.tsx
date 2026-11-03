"use client";

import { useMemo, useState, useTransition } from "react";
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
  const tz = timezoneLabel || shortTimezoneLabel(HOUSEHOLD_TIMEZONE);
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
      // Recurring nights (air_days) are typical schedule only — this week’s
      // grid needs an episode whose next_air_at falls in the current MT week.
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

  function runSearch(value: string) {
    setQuery(value);
    setError(null);
    setSelected(null);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    startSearch(async () => {
      const res = await searchShowsAction(value);
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
        setMessage(`Added ${res.show.title} to the calendar — ${auto}`);
        setSelected(null);
        setHits([]);
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
            : `${res.show.title} isn’t airing — removed from the calendar (${res.label ?? "between seasons"}).`,
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
            ? `, ${res.offCalendar} off the calendar (not airing)`
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
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-brand">
            Movie List
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink sm:text-5xl">
            What we&apos;re watching
          </h1>
          <p className="mt-3 text-base text-ink-muted sm:text-lg">
            Only shows with a next episode go on the week calendar. Times are{" "}
            <span className="font-medium text-ink">{tz}</span> (Mountain).
          </p>
        </div>
        <button
          type="button"
          disabled={pending || shows.length === 0}
          onClick={syncAll}
          className="shrink-0 rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-cream disabled:opacity-50"
        >
          {pending ? "Working…" : "Sync all from TVMaze"}
        </button>
      </header>

      {(error || message) && (
        <div
          className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-accent-rose/30 bg-accent-rose/5 text-accent-rose"
              : "border-brand/25 bg-brand/5 text-brand-dark"
          }`}
          role="status"
        >
          {error || message}
        </div>
      )}

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl tracking-tight text-ink">
              This week
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Today is {today} · {tz}
              {offCalendar.length > 0
                ? ` · ${offCalendar.length} saved show${offCalendar.length === 1 ? "" : "s"} hidden (not airing)`
                : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {WEEKDAYS.map((day) => {
            const items = byDay[day];
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`min-h-[8.5rem] rounded-2xl border p-3 ${
                  isToday
                    ? "border-brand/35 bg-brand/[0.06] shadow-sm"
                    : "border-ink/[0.06] bg-white"
                }`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    isToday ? "text-brand-dark" : "text-ink-faint"
                  }`}
                >
                  {day.slice(0, 3)}
                  {isToday ? " · today" : ""}
                </p>
                <ul className="mt-2 space-y-2">
                  {items.length === 0 ? (
                    <li className="text-xs text-ink-faint">—</li>
                  ) : (
                    items.map((show) => (
                      <li key={`${day}-${show.id}`} className="text-sm">
                        <p className="font-medium leading-snug text-ink">
                          {show.title}
                        </p>
                        <p className="text-xs text-ink-muted">
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

      <section className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h2 className="font-serif text-2xl tracking-tight text-ink">
            Now watching
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {shows.length === 0
              ? "Nothing saved yet — search for a show that’s on the air."
              : `${onThisWeek.length} on this week` +
                (onCalendar.length > onThisWeek.length
                  ? ` · ${onCalendar.length - onThisWeek.length} airing later`
                  : "") +
                (offCalendar.length
                  ? ` · ${offCalendar.length} not airing`
                  : "")}
          </p>

          <ul className="mt-5 space-y-3">
            {shows.map((show) => (
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
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-sm">
          <h2 className="font-serif text-2xl tracking-tight text-ink">
            Add a show
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Search TVMaze (and what&apos;s on US TV this week). Host-titled shows
            like “Bobby Flay&apos;s The Line” match a short search for “The Line”.
            Shows without a next episode can&apos;t be added.
          </p>

          <label className="mt-5 block">
            <span className="sr-only">Search shows</span>
            <input
              type="search"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search a TV show…"
              className="w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-2.5 text-sm text-ink outline-none ring-brand/30 placeholder:text-ink-faint focus:border-brand/40 focus:ring-2"
              autoComplete="off"
            />
          </label>
          {searching && (
            <p className="mt-2 text-xs text-ink-faint">Checking air dates…</p>
          )}

          {hits.length > 0 && (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {hits.map((hit) => {
                const alreadyListed = listedTvmazeIds.has(hit.tvmazeId);
                const airing = hit.currentlyAiring;
                const inactive = alreadyListed || !airing;
                return (
                  <li
                    key={hit.tvmazeId}
                    className={`rounded-xl border px-2 py-2 ${
                      inactive
                        ? "border-ink/[0.04] bg-cream/60 opacity-90"
                        : selected?.tvmazeId === hit.tvmazeId
                          ? "border-brand/30 bg-brand/[0.04]"
                          : "border-transparent hover:border-ink/10 hover:bg-cream"
                    }`}
                  >
                    <div className="flex items-start gap-3">
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink">{hit.title}</p>
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
                        <p className="text-xs text-ink-muted">
                          {[hit.network, hit.countryCode, hit.status]
                            .filter(Boolean)
                            .join(" · ")}
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
                          {!inactive && hit.source.listingLabel
                            ? ` (${hit.source.listingLabel})`
                            : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {alreadyListed ? (
                            <p className="text-xs text-ink-faint">
                              Already on your list — no need to add again.
                            </p>
                          ) : airing ? (
                            <>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => addHit(hit)}
                                className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                              >
                                Add to calendar
                              </button>
                              <button
                                type="button"
                                onClick={() => pickHit(hit)}
                                className="rounded-lg border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-white"
                              >
                                Adjust first
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
            <div className="mt-5 space-y-4 border-t border-ink/[0.06] pt-5">
              <div>
                <p className="font-medium text-ink">{selected.title}</p>
                <p className="text-xs text-brand-dark">
                  {selected.airingLabel}
                  {selected.mountain.label
                    ? ` · ${selected.mountain.label}`
                    : ""}
                  {selected.source.listingLabel
                    ? ` · network ${selected.source.listingLabel}`
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
                Override auto time (manual edit)
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
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
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
                      className="mt-2 w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/30"
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
                  className="mt-2 w-full rounded-xl border border-ink/10 bg-cream px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-brand/40 focus:ring-2 focus:ring-brand/30"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => addHit(selected, { manual })}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {pending ? "Saving…" : "Add to calendar"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-ink-muted hover:bg-cream"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
    : "Hidden from this week until new episodes are scheduled";

  return (
    <li
      className={`rounded-2xl border p-4 ${
        airing
          ? "border-ink/[0.06] bg-white"
          : "border-ink/[0.04] bg-cream/50"
      }`}
    >
      <div className="flex gap-3">
        {show.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={show.image_url}
            alt=""
            className={`h-16 w-11 shrink-0 rounded object-cover ${!airing ? "grayscale" : ""}`}
          />
        ) : (
          <span className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-cream-dark text-xs text-ink-faint">
            TV
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-ink">{show.title}</p>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                airing
                  ? onThisWeek
                    ? "bg-brand/10 text-brand-dark"
                    : "bg-ink/5 text-ink-muted"
                  : "bg-ink/5 text-ink-muted"
              }`}
            >
              {badge}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            {[show.network, show.tv_status, show.notes]
              .filter(Boolean)
              .join(" · ") || " "}
          </p>
          <p className={`mt-1 text-sm ${airing ? "text-brand-dark" : "text-ink-muted"}`}>
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
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${
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
                className="rounded-lg border border-ink/10 bg-cream px-2.5 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onSaveSchedule(days, time);
                    setEditing(false);
                  }}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
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
                  className="rounded-lg px-3 py-1.5 text-xs text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {show.tvmaze_id ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={onSync}
                  className="rounded-lg border border-brand/20 bg-brand/5 px-2.5 py-1 text-xs font-medium text-brand-dark hover:bg-brand/10"
                >
                  Sync airing status
                </button>
              ) : null}
              {airing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-cream"
                >
                  Edit
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => onStatus("paused")}
                className="rounded-lg border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-cream"
              >
                Pause
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onStatus("finished")}
                className="rounded-lg border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-cream"
              >
                Finished
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onRemove}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-accent-rose hover:bg-accent-rose/5"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
