/** Household always watches in Mountain Time. */
export const HOUSEHOLD_TIMEZONE = "America/Denver" as const;

/** US networks publish Eastern; "8/7c" means this zone. */
export const US_EASTERN_TIMEZONE = "America/New_York" as const;

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_SET = new Set<string>(WEEKDAYS);

export function isWeekday(value: string): value is Weekday {
  return WEEKDAY_SET.has(value);
}

/** Format "21:00" / "21:00:00" → "9:00 PM". */
export function formatTime12h(time: string | null | undefined): string {
  if (!time) return "TBD";
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time;
  let hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${suffix}`;
}

/** Normalize DB/API time to HH:MM. */
export function normalizeTimeHHMM(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Convert a weekly wall-clock time from one IANA zone to another.
 * Uses a mid-season Wednesday so US Eastern/Mountain DST usually align.
 */
export function convertWallClockTime(
  timeHHMM: string,
  fromTimeZone: string,
  toTimeZone: string = HOUSEHOLD_TIMEZONE,
): string | null {
  const normalized = normalizeTimeHHMM(timeHHMM);
  if (!normalized) return null;
  if (fromTimeZone === toTimeZone) return normalized;

  const [hour, minute] = normalized.split(":").map(Number);
  // Fixed reference Wednesday (winter) — US zones share DST shifts together.
  const year = 2024;
  const month = 1; // February
  const day = 7;

  const fromOffset = tzOffsetMinutes(
    new Date(Date.UTC(year, month - 1, day, 12, 0, 0)),
    fromTimeZone,
  );
  const absolute =
    Date.UTC(year, month - 1, day, hour, minute, 0) - fromOffset * 60_000;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: toTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(absolute));

  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  // hourCycle h23 can still yield "24" in some engines
  const hourNum = Number(h) === 24 ? 0 : Number(h);
  return `${String(hourNum).padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/** Instant (TVMaze airstamp) → weekday + wall clock in Mountain Time. */
export function mountainFromAirstamp(airstamp: string): {
  day: Weekday;
  time: string;
} | null {
  const date = new Date(airstamp);
  if (Number.isNaN(date.getTime())) return null;

  const dayName = new Intl.DateTimeFormat("en-US", {
    timeZone: HOUSEHOLD_TIMEZONE,
    weekday: "long",
  }).format(date);
  if (!isWeekday(dayName)) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HOUSEHOLD_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const hourNum = Number(h) === 24 ? 0 : Number(h);
  return {
    day: dayName,
    time: `${String(hourNum).padStart(2, "0")}:${m.padStart(2, "0")}`,
  };
}

/**
 * US listings are sold as "8/7c" (Eastern / Central).
 * Returns that shorthand when the source zone is US Eastern.
 */
export function formatUsListingLabel(
  easternTimeHHMM: string | null,
  sourceTimezone: string | null,
): string | null {
  if (!easternTimeHHMM) return null;
  const tz = sourceTimezone || US_EASTERN_TIMEZONE;
  if (tz !== US_EASTERN_TIMEZONE && tz !== "America/Detroit") {
    return `${formatTime12h(easternTimeHHMM)} (${tz})`;
  }
  const hourMatch = /^(\d{1,2}):(\d{2})$/.exec(easternTimeHHMM);
  if (!hourMatch) return `${formatTime12h(easternTimeHHMM)} ET`;
  const hour = Number(hourMatch[1]);
  const minute = hourMatch[2];
  if (minute === "00") {
    const et12 = ((hour + 11) % 12) + 1;
    const ct24 = (hour + 23) % 24;
    const ct12 = ((ct24 + 11) % 12) + 1;
    return `${et12}/${ct12}c`;
  }
  return `${formatTime12h(easternTimeHHMM)} ET`;
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

export function shortTimezoneLabel(timeZone: string = HOUSEHOLD_TIMEZONE): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "MT";
  } catch {
    return "MT";
  }
}

/** Today's weekday name in household timezone. */
export function todayWeekday(now = new Date()): Weekday {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: HOUSEHOLD_TIMEZONE,
    weekday: "long",
  }).format(now);
  return isWeekday(name) ? name : "Monday";
}
