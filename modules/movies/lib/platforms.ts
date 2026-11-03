/**
 * Where the household actually presses play.
 * Hulu titles are tagged Disney+ — we watch the Disney Bundle through Disney+,
 * and Disney is folding Hulu into that app.
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
