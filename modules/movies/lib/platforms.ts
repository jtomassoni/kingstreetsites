import { WEEKDAYS, type Weekday } from "@movies/lib/timezone";

/**
 * Where the household actually presses play.
 * Hulu titles are tagged Disney+ — we watch the Disney Bundle through Disney+,
 * and Disney is folding Hulu into that app.
 *
 * This household watches on streaming (not live TV). Calendar times are when
 * the episode is available to press play — not the linear network airtime.
 */
export const WATCH_PLATFORMS = [
  { id: "max", label: "Max", short: "Max" },
  { id: "netflix", label: "Netflix", short: "N" },
  { id: "disney_plus", label: "Disney+", short: "D+" },
  { id: "prime", label: "Prime Video", short: "Prime" },
  { id: "peacock", label: "Peacock", short: "Peacock" },
  { id: "paramount_plus", label: "Paramount+", short: "P+" },
  { id: "apple_tv", label: "Apple TV+", short: "TV+" },
  { id: "youtube_tv", label: "YouTube TV", short: "YTTV" },
  { id: "cable", label: "Cable / live", short: "Live" },
  { id: "other", label: "Other", short: "?" },
] as const;

export type WatchPlatformId = (typeof WATCH_PLATFORMS)[number]["id"];

/** Live / same-time-as-listing destinations. */
const LIVE_PLATFORMS = new Set<WatchPlatformId>(["youtube_tv", "cable"]);

/** Max overnight drop for cable nets (Food Network 8/7c → Max Tue 1 AM). */
const MAX_OVERNIGHT_TIME = "01:00";

/** Legacy ids still accepted from older rows / forms. */
const LEGACY_PLATFORM_ALIASES: Record<string, WatchPlatformId> = {
  hulu: "disney_plus",
  disney: "disney_plus",
  "disney+": "disney_plus",
  hbo: "max",
  hbo_max: "max",
  "hbo max": "max",
};

/**
 * TVMaze network / webChannel name → primary Watch On id.
 * Streaming originals resolve to a single subscriber; broadcast stays live-oriented.
 */
const NETWORK_TO_PLATFORM: Record<string, WatchPlatformId> = {
  netflix: "netflix",
  max: "max",
  hbo: "max",
  "hbo max": "max",
  "disney+": "disney_plus",
  "disney plus": "disney_plus",
  disney: "disney_plus",
  hulu: "disney_plus",
  "prime video": "prime",
  "amazon prime video": "prime",
  amazon: "prime",
  "amazon instant video": "prime",
  peacock: "peacock",
  "paramount+": "paramount_plus",
  "paramount plus": "paramount_plus",
  paramount: "paramount_plus",
  "apple tv+": "apple_tv",
  "apple tv": "apple_tv",
};

/**
 * Broadcast / cable nets are not exclusives — the household may watch live
 * (YouTube TV / cable) or on a delayed streamer (Max, Disney+, Peacock, …).
 * We only narrow the picker for known streaming originals.
 */

const PLATFORM_IDS = new Set<string>(WATCH_PLATFORMS.map((p) => p.id));

export function normalizeWatchPlatform(
  value: string | null | undefined,
): WatchPlatformId | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (LEGACY_PLATFORM_ALIASES[raw]) return LEGACY_PLATFORM_ALIASES[raw];
  if (PLATFORM_IDS.has(raw)) return raw as WatchPlatformId;
  return null;
}

export function isWatchPlatformId(value: string): value is WatchPlatformId {
  return normalizeWatchPlatform(value) !== null;
}

export function watchPlatformLabel(
  id: string | null | undefined,
): string | null {
  const normalized = normalizeWatchPlatform(id) ?? id;
  if (!normalized) return null;
  return (
    WATCH_PLATFORMS.find((p) => p.id === normalized)?.label ?? String(normalized)
  );
}

export function watchPlatformShort(
  id: string | null | undefined,
): string | null {
  const normalized = normalizeWatchPlatform(id);
  if (!normalized) return id ?? null;
  return WATCH_PLATFORMS.find((p) => p.id === normalized)?.short ?? normalized;
}

function normalizeNetworkKey(network: string): string {
  return network
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Platforms that make sense for a TVMaze network/webChannel.
 * Exclusives (e.g. Netflix) return that service + Other; broadcast → live options;
 * unknown → full list.
 */
export function suggestedWatchPlatforms(
  network: string | null | undefined,
): WatchPlatformId[] {
  if (!network?.trim()) {
    return WATCH_PLATFORMS.map((p) => p.id);
  }
  const key = normalizeNetworkKey(network);
  const exclusive = NETWORK_TO_PLATFORM[key];
  if (exclusive) {
    return exclusive === "other" ? ["other"] : [exclusive, "other"];
  }
  return WATCH_PLATFORMS.map((p) => p.id);
}

/** Prefer the exclusive streamer when the show only belongs on one service. */
export function defaultWatchPlatform(
  network: string | null | undefined,
): WatchPlatformId | null {
  const suggested = suggestedWatchPlatforms(network);
  const exclusive = suggested.filter((id) => id !== "other");
  return exclusive.length === 1 ? exclusive[0]! : null;
}

/** True when add/edit should ask which service — more than one real option. */
export function needsWatchPlatformChoice(
  network: string | null | undefined,
): boolean {
  return defaultWatchPlatform(network) === null;
}

export function isLiveWatchPlatform(
  platform: string | null | undefined,
): boolean {
  const id = normalizeWatchPlatform(platform);
  return id !== null && LIVE_PLATFORMS.has(id);
}

function nextWeekday(day: Weekday): Weekday {
  const index = WEEKDAYS.indexOf(day);
  return WEEKDAYS[(index + 1) % WEEKDAYS.length]!;
}

/**
 * Watchable night/time for a platform, given the TVMaze/network listing.
 *
 * - Live (YouTube TV / cable): same as the listing
 * - Streaming original on its home service: same as the listing
 * - Max for broadcast/cable nets: next calendar day at 1:00 AM
 *   (e.g. Food Network Mon 6 PM MT → Max Tue 1:00 AM)
 */
export function resolveStreamWatchSchedule(input: {
  platform: string;
  network?: string | null;
  listedDays: Weekday[];
  listedTime: string | null;
}): { days: Weekday[]; time: string | null } {
  const platform = normalizeWatchPlatform(input.platform);
  const listedDays = input.listedDays.filter((d) => WEEKDAYS.includes(d));
  const listedTime = input.listedTime;

  if (!platform) {
    return { days: listedDays, time: listedTime };
  }

  if (isLiveWatchPlatform(platform)) {
    return { days: listedDays, time: listedTime };
  }

  const home = defaultWatchPlatform(input.network);
  if (home && home === platform) {
    return { days: listedDays, time: listedTime };
  }

  if (platform === "max" && listedDays.length > 0) {
    return {
      days: listedDays.map(nextWeekday),
      time: MAX_OVERNIGHT_TIME,
    };
  }

  return { days: listedDays, time: listedTime };
}
