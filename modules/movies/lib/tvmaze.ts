import { detectCurrentlyAiring } from "@movies/lib/airing";
import {
  convertWallClockTime,
  formatTime12h,
  formatUsListingLabel,
  HOUSEHOLD_TIMEZONE,
  isWeekday,
  mountainFromAirstamp,
  normalizeTimeHHMM,
  resolveDisplayTimeZone,
  shortTimezoneLabel,
  US_EASTERN_TIMEZONE,
  type Weekday,
} from "@movies/lib/timezone";

export type ScheduleSource =
  | "airstamp"
  | "show_schedule"
  | "recent_episodes"
  | "none";

export type TvMazeSearchHit = {
  tvmazeId: number;
  title: string;
  imageUrl: string | null;
  network: string | null;
  summary: string | null;
  status: string | null;
  language: string | null;
  countryCode: string | null;
  currentlyAiring: boolean;
  airingLabel: string;
  nextAirAt: string | null;
  /** Original schedule from the network/channel. */
  source: {
    days: Weekday[];
    time: string | null;
    timezone: string | null;
    listingLabel: string | null;
  };
  /**
   * Converted to the viewer's display timezone (browser locale; usually Mountain at home).
   * Field name kept for compatibility with existing call sites.
   */
  mountain: {
    days: Weekday[];
    time: string | null;
    label: string | null;
  };
  scheduleSource: ScheduleSource;
};

type RawEpisode = {
  airdate?: string | null;
  airtime?: string | null;
  airstamp?: string | null;
};

type RawShow = {
  id: number;
  name: string;
  status?: string | null;
  language?: string | null;
  summary?: string | null;
  schedule?: { time?: string | null; days?: string[] | null } | null;
  network?: {
    name?: string | null;
    country?: { code?: string | null; timezone?: string | null } | null;
  } | null;
  webChannel?: {
    name?: string | null;
    country?: { code?: string | null; timezone?: string | null } | null;
  } | null;
  image?: { medium?: string | null; original?: string | null } | null;
  _embedded?: {
    nextepisode?: RawEpisode | null;
    previousepisode?: RawEpisode | null;
  } | null;
};

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

function channelTimezone(show: RawShow): string | null {
  return (
    show.network?.country?.timezone ||
    show.webChannel?.country?.timezone ||
    null
  );
}

function channelName(show: RawShow): string | null {
  return show.network?.name || show.webChannel?.name || null;
}

function countryCode(show: RawShow): string | null {
  return (
    show.network?.country?.code ||
    show.webChannel?.country?.code ||
    null
  );
}

function localScheduleLabel(
  days: Weekday[],
  time: string | null,
  displayTimeZone: string,
): string | null {
  if (!days.length && !time) return null;
  const dayPart = days.length
    ? days.map((d) => d.slice(0, 3)).join(", ")
    : "No fixed night";
  const tz = shortTimezoneLabel(displayTimeZone);
  return `${dayPart} · ${formatTime12h(time)} ${tz}`;
}

/**
 * Resolve weekly schedule in the viewer's timezone.
 * 1) Official show.schedule + network TZ (handles FOX "8/7c" → local)
 * 2) Next/previous episode airstamp
 * 3) Recent episode airstamps
 */
export function resolveMountainSchedule(
  show: RawShow,
  recentEpisodes: RawEpisode[] = [],
  displayTimeZone: string = HOUSEHOLD_TIMEZONE,
): Pick<TvMazeSearchHit, "source" | "mountain" | "scheduleSource"> {
  const displayTz = resolveDisplayTimeZone(displayTimeZone);
  const sourceTz =
    channelTimezone(show) ||
    (countryCode(show) === "US" ? US_EASTERN_TIMEZONE : null);
  const scheduleDays = (show.schedule?.days ?? []).filter(isWeekday);
  const scheduleTime = normalizeTimeHHMM(show.schedule?.time ?? null);

  if (scheduleTime && sourceTz) {
    const localTime = convertWallClockTime(
      scheduleTime,
      sourceTz,
      displayTz,
    );
    return {
      source: {
        days: scheduleDays,
        time: scheduleTime,
        timezone: sourceTz,
        listingLabel: formatUsListingLabel(scheduleTime, sourceTz),
      },
      mountain: {
        days: scheduleDays,
        time: localTime,
        label: localScheduleLabel(scheduleDays, localTime, displayTz),
      },
      scheduleSource: "show_schedule",
    };
  }

  const candidateStamps = [
    show._embedded?.nextepisode?.airstamp,
    show._embedded?.previousepisode?.airstamp,
    ...recentEpisodes.map((e) => e.airstamp),
  ].filter((s): s is string => Boolean(s));

  for (const stamp of candidateStamps) {
    const local = mountainFromAirstamp(stamp, displayTz);
    if (!local) continue;

    const days = scheduleDays.length ? scheduleDays : [local.day];
    const sourceAirtime = normalizeTimeHHMM(
      show._embedded?.nextepisode?.airtime ||
        show._embedded?.previousepisode?.airtime ||
        recentEpisodes.find((e) => e.airstamp === stamp)?.airtime ||
        null,
    );

    return {
      source: {
        days: scheduleDays.length ? scheduleDays : [local.day],
        time: sourceAirtime,
        timezone: sourceTz,
        listingLabel: formatUsListingLabel(sourceAirtime, sourceTz),
      },
      mountain: {
        days,
        time: local.time,
        label: localScheduleLabel(days, local.time, displayTz),
      },
      scheduleSource: recentEpisodes.some((e) => e.airstamp === stamp)
        ? "recent_episodes"
        : "airstamp",
    };
  }

  if (scheduleDays.length) {
    return {
      source: {
        days: scheduleDays,
        time: null,
        timezone: sourceTz,
        listingLabel: null,
      },
      mountain: {
        days: scheduleDays,
        time: null,
        label: localScheduleLabel(scheduleDays, null, displayTz),
      },
      scheduleSource: "show_schedule",
    };
  }

  return {
    source: {
      days: [],
      time: null,
      timezone: sourceTz,
      listingLabel: null,
    },
    mountain: { days: [], time: null, label: null },
    scheduleSource: "none",
  };
}

export function mapTvMazeShow(
  show: RawShow,
  recentEpisodes: RawEpisode[] = [],
  displayTimeZone: string = HOUSEHOLD_TIMEZONE,
): TvMazeSearchHit {
  const resolved = resolveMountainSchedule(show, recentEpisodes, displayTimeZone);
  const airing = detectCurrentlyAiring({
    status: show.status,
    nextEpisode: show._embedded?.nextepisode ?? null,
  });

  return {
    tvmazeId: show.id,
    title: show.name,
    imageUrl: show.image?.medium || show.image?.original || null,
    network: channelName(show),
    summary: stripHtml(show.summary),
    status: show.status ?? null,
    language: show.language ?? null,
    countryCode: countryCode(show),
    currentlyAiring: airing.currentlyAiring,
    airingLabel: airing.airingLabel,
    nextAirAt: airing.nextAirAt,
    ...resolved,
  };
}

/** Normalize titles/queries for loose matching. */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(\w+)s\b/g, "$1") // flays → flay (possessives / plurals)
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value: string): string[] {
  const stop = new Set(["the", "a", "an", "of", "and", "with"]);
  return normalizeTitle(value)
    .split(" ")
    .filter((t) => t.length > 1 && !stop.has(t));
}

/**
 * True when the show title is the query, or contains it as a phrase
 * (e.g. "Bobby Flay's The Line" matches "The Line").
 */
export function titleMatchesQuery(showName: string, query: string): boolean {
  const title = normalizeTitle(showName);
  const q = normalizeTitle(query);
  if (!title || !q || q.length < 2) return false;
  if (title === q) return true;
  // Phrase containment handles host prefixes: "... the line"
  if (title.endsWith(` ${q}`) || title.startsWith(`${q} `)) return true;
  if (title.includes(` ${q} `)) return true;

  // Multi-word token path: "bobby flay line" → tokens appear in order.
  const qTokens = significantTokens(query);
  if (qTokens.length < 2) return false;
  const tTokens = significantTokens(showName);
  let from = 0;
  for (const token of qTokens) {
    const idx = tTokens.indexOf(token, from);
    if (idx === -1) return false;
    from = idx + 1;
  }
  return true;
}

/** Prefer exact / tight title matches and US editions that are actually airing. */
function rankHit(hit: TvMazeSearchHit, query: string): number {
  let score = 0;
  const q = normalizeTitle(query);
  const title = normalizeTitle(hit.title);
  if (title === q) score += 80;
  else if (title.startsWith(`${q} `) || title.endsWith(` ${q}`)) score += 55;
  else if (titleMatchesQuery(hit.title, query)) score += 35;
  else score -= 40;
  if (hit.countryCode === "US") score += 30;
  else if (hit.countryCode) score -= 15;
  if (hit.language === "English") score += 10;
  if (hit.currentlyAiring) score += 40;
  else score -= 20;
  if (hit.mountain.time) score += 8;
  if (hit.mountain.days.length) score += 4;
  if (hit.status === "Running") score += 3;
  return score;
}

/** Drop weak combo hits — require a real title relationship to the query. */
function isRelevantHit(hit: TvMazeSearchHit, query: string): boolean {
  return titleMatchesQuery(hit.title, query);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    throw new Error(`TVMaze request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function fetchShowWithEpisodes(tvmazeId: number): Promise<RawShow | null> {
  const showUrl =
    `https://api.tvmaze.com/shows/${tvmazeId}` +
    `?embed[]=nextepisode&embed[]=previousepisode`;
  const res = await fetch(showUrl, {
    headers: { Accept: "application/json" },
    next: { revalidate: 1800 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TVMaze lookup failed (${res.status})`);
  return res.json() as Promise<RawShow>;
}

function mountainDateString(offsetDays: number, now = new Date()): string {
  // Format YYYY-MM-DD in household TZ, then shift by calendar days.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HOUSEHOLD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const utc = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return utc.toISOString().slice(0, 10);
}

type ScheduleRow = {
  show?: RawShow | null;
};

/**
 * Fallback only: TVMaze text search often misses host-prefixed titles
 * ("Bobby Flay's The Line" for "The Line"). Scan a short US schedule window.
 */
async function findShowIdsOnUsSchedule(query: string): Promise<number[]> {
  const dates = Array.from({ length: 7 }, (_, i) => mountainDateString(i));
  const rows = await Promise.all(
    dates.map(async (date) => {
      try {
        return await fetchJson<ScheduleRow[]>(
          `https://api.tvmaze.com/schedule?country=US&date=${date}`,
        );
      } catch {
        return [] as ScheduleRow[];
      }
    }),
  );

  const ids: number[] = [];
  const seen = new Set<number>();
  for (const day of rows) {
    for (const row of day) {
      const show = row.show;
      if (!show?.id || !show.name) continue;
      if (!titleMatchesQuery(show.name, query)) continue;
      if (seen.has(show.id)) continue;
      seen.add(show.id);
      ids.push(show.id);
      if (ids.length >= 6) return ids;
    }
  }
  return ids;
}

async function enrichShows(
  ids: number[],
  displayTimeZone: string = HOUSEHOLD_TIMEZONE,
): Promise<TvMazeSearchHit[]> {
  const unique = [...new Set(ids)].slice(0, 8);
  const hits = await Promise.all(
    unique.map(async (id) => {
      try {
        const detail = await fetchShowWithEpisodes(id);
        return detail ? mapTvMazeShow(detail, [], displayTimeZone) : null;
      } catch {
        return null;
      }
    }),
  );
  return hits.filter((h): h is TvMazeSearchHit => Boolean(h));
}

function finalizeHits(hits: TvMazeSearchHit[], q: string): TvMazeSearchHit[] {
  const relevant = hits.filter((h) => isRelevantHit(h, q));
  const ranked = relevant.sort((a, b) => rankHit(b, q) - rankHit(a, q));
  // Prefer shows you can actually add; keep a couple non-airing only if nothing airs.
  const airing = ranked.filter((h) => h.currentlyAiring);
  if (airing.length > 0) return airing.slice(0, 6);
  return ranked.slice(0, 4);
}

export async function searchTvShows(
  query: string,
  displayTimeZone: string = HOUSEHOLD_TIMEZONE,
): Promise<TvMazeSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const tz = resolveDisplayTimeZone(displayTimeZone);

  const data = await fetchJson<Array<{ show: RawShow; score: number }>>(
    `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`,
  );

  const primaryIds = data
    .filter((row) => titleMatchesQuery(row.show.name, q))
    .slice(0, 8)
    .map((row) => row.show.id);

  let enriched = await enrichShows(primaryIds, tz);
  let results = finalizeHits(enriched, q);

  // Schedule fallback only when the text search found nothing usable.
  if (results.length === 0) {
    const scheduleIds = await findShowIdsOnUsSchedule(q);
    enriched = await enrichShows(scheduleIds, tz);
    results = finalizeHits(enriched, q);
  }

  return results;
}

export async function lookupTvShow(
  tvmazeId: number,
  displayTimeZone: string = HOUSEHOLD_TIMEZONE,
): Promise<TvMazeSearchHit | null> {
  const show = await fetchShowWithEpisodes(tvmazeId);
  if (!show) return null;
  const tz = resolveDisplayTimeZone(displayTimeZone);

  let recent: RawEpisode[] = [];
  const hasScheduleTime = Boolean(normalizeTimeHHMM(show.schedule?.time ?? null));
  if (!hasScheduleTime) {
    try {
      const episodes = await fetchJson<RawEpisode[]>(
        `https://api.tvmaze.com/shows/${tvmazeId}/episodes`,
      );
      recent = episodes.slice(-12);
    } catch {
      recent = [];
    }
  }

  return mapTvMazeShow(show, recent, tz);
}
