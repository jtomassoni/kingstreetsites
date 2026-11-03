import {
  formatTime12h,
  HOUSEHOLD_TIMEZONE,
  mountainFromAirstamp,
  todayWeekday,
  WEEKDAYS,
  type Weekday,
} from "@movies/lib/timezone";

const ENDED_STATUSES = new Set([
  "ended",
  "canceled",
  "cancelled",
]);

const WEEKDAY_INDEX = Object.fromEntries(
  WEEKDAYS.map((day, index) => [day, index]),
) as Record<Weekday, number>;

export type AiringEpisode = {
  airdate?: string | null;
  airstamp?: string | null;
};

/**
 * A show is "currently airing" only when TVMaze has a next episode.
 * Leftover weekly schedule rows (e.g. MasterChef between seasons) do not count.
 */
export function detectCurrentlyAiring(input: {
  status?: string | null;
  nextEpisode?: AiringEpisode | null;
  now?: Date;
}): {
  currentlyAiring: boolean;
  reason: "ended" | "no_next_episode" | "airing";
  nextAirAt: string | null;
  airingLabel: string;
} {
  const status = (input.status || "").trim().toLowerCase();
  if (ENDED_STATUSES.has(status)) {
    return {
      currentlyAiring: false,
      reason: "ended",
      nextAirAt: null,
      airingLabel: status === "ended" ? "Ended — not airing" : "Canceled — not airing",
    };
  }

  const next = input.nextEpisode;
  const stamp = next?.airstamp || null;
  if (!stamp && !next?.airdate) {
    return {
      currentlyAiring: false,
      reason: "no_next_episode",
      nextAirAt: null,
      airingLabel:
        status === "running"
          ? "Between seasons — not on the calendar"
          : "Not airing now",
    };
  }

  return {
    currentlyAiring: true,
    reason: "airing",
    nextAirAt: stamp,
    airingLabel: formatNextAirLabel(stamp, next?.airdate ?? null, input.now),
  };
}

/**
 * Week-calendar placement: only the weekday of `nextAirAt` when that episode
 * falls in the current Mon–Sun Mountain week.
 *
 * Recurring `air_days` (e.g. “Fridays”) must not fill this week’s grid unless
 * the next listed episode is actually this Friday.
 */
export function calendarDayThisWeek(
  nextAirAt: string | null | undefined,
  now = new Date(),
): Weekday | null {
  if (!nextAirAt) return null;
  const local = mountainFromAirstamp(nextAirAt);
  if (!local) return null;

  const airYmd = mountainYmd(new Date(nextAirAt));
  if (!airYmd) return null;

  const { startYmd, endYmd } = mountainWeekYmdBounds(now);
  if (airYmd < startYmd || airYmd > endYmd) return null;
  return local.day;
}

function mountainYmd(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOUSEHOLD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function mountainWeekYmdBounds(now: Date): { startYmd: string; endYmd: string } {
  const todayYmd = mountainYmd(now);
  if (!todayYmd) {
    return { startYmd: "9999-99-99", endYmd: "0000-00-00" };
  }
  const startYmd = addDaysToYmd(todayYmd, -WEEKDAY_INDEX[todayWeekday(now)]);
  return { startYmd, endYmd: addDaysToYmd(startYmd, 6) };
}

function addDaysToYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function formatNextAirLabel(
  airstamp: string | null,
  airdate: string | null,
  now = new Date(),
): string {
  if (airstamp) {
    const date = new Date(airstamp);
    if (!Number.isNaN(date.getTime())) {
      const label = new Intl.DateTimeFormat("en-US", {
        timeZone: HOUSEHOLD_TIMEZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
      const diffDays =
        (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 0) return `Airing · last listed ${label} MT`;
      return `Airing · next ${label} MT`;
    }
  }
  if (airdate) return `Airing · next ${airdate}`;
  return "Airing now";
}

/**
 * Card line for a watching show: prefer the concrete next episode over the
 * recurring "usually Tuesdays" schedule so later airings aren't mistaken for
 * this week's calendar.
 */
export function formatWatchingAirLine(input: {
  nextAirAt?: string | null;
  airDays?: Weekday[];
  airTimeLocal?: string | null;
  timezoneLabel?: string;
  now?: Date;
}): string {
  const tz = input.timezoneLabel || "MT";
  const now = input.now ?? new Date();
  const stamp = input.nextAirAt;

  if (stamp) {
    const date = new Date(stamp);
    if (!Number.isNaN(date.getTime())) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: HOUSEHOLD_TIMEZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).formatToParts(date);
      const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? "";
      const weekday = get("weekday");
      const month = get("month");
      const day = get("day");
      const hour = get("hour");
      const minute = get("minute");
      const dayPeriod = get("dayPeriod");
      const time = `${hour}:${minute} ${dayPeriod}`.trim();
      const dated = `${weekday} ${month} ${day} · ${time} ${tz}`;

      if (calendarDayThisWeek(stamp, now)) {
        return `This ${dated}`;
      }
      if (date.getTime() < now.getTime()) {
        return `Last listed ${dated}`;
      }
      return `Next ${dated}`;
    }
  }

  const days = input.airDays ?? [];
  if (days.length) {
    return `Usually ${days.map((d) => d.slice(0, 3)).join(", ")} · ${formatTime12h(input.airTimeLocal)} ${tz}`;
  }
  return `No weekly night set · ${tz}`;
}
