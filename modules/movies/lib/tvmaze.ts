import { detectCurrentlyAiring } from "@movies/lib/airing";
import {
  convertWallClockTime,
  formatTime12h,
  formatUsListingLabel,
  HOUSEHOLD_TIMEZONE,
  isWeekday,
  mountainFromAirstamp,
  normalizeTimeHHMM,
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
  /** Converted to America/Denver for the household. */
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

function mountainLabel(days: Weekday[], time: string | null): string | null {
  if (!days.length && !time) return null;
  const dayPart = days.length
    ? days.map((d) => d.slice(0, 3)).join(", ")
    : "No fixed night";
  return `${dayPart} · ${formatTime12h(time)} MT`;
}

/**
 * Resolve weekly Mountain schedule.
 * 1) Official show.schedule + network TZ (handles FOX "8/7c" → 6pm MT)
 * 2) Next/previous episode airstamp
 * 3) Recent episode airstamps
 */
export function resolveMountainSchedule(
  show: RawShow,
  recentEpisodes: RawEpisode[] = [],
): Pick<TvMazeSearchHit, "source" | "mountain" | "scheduleSource"> {
  const sourceTz =
    channelTimezone(show) ||
    (countryCode(show) === "US" ? US_EASTERN_TIMEZONE : null);
  const scheduleDays = (show.schedule?.days ?? []).filter(isWeekday);
  const scheduleTime = normalizeTimeHHMM(show.schedule?.time ?? null);

  if (scheduleTime && sourceTz) {
    const mountainTime = convertWallClockTime(
      scheduleTime,
      sourceTz,
      HOUSEHOLD_TIMEZONE,
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
        time: mountainTime,
        label: mountainLabel(scheduleDays, mountainTime),
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
    const local = mountainFromAirstamp(stamp);
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
        label: mountainLabel(days, local.time),
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
        label: mountainLabel(scheduleDays, null),
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
): TvMazeSearchHit {
  const resolved = resolveMountainSchedule(show, recentEpisodes);
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

/** Prefer US/English network editions that are actually airing. */
function rankHit(hit: TvMazeSearchHit, query: string): number {
  let score = 0;
  const q = normalizeTitle(query);
  const title = normalizeTitle(hit.title);
  if (title === q) score += 50;
  else if (titleMatchesQuery(hit.title, query)) score += 40;
  if (hit.countryCode === "US") score += 30;
  if (hit.language === "English") score += 10;
  if (hit.currentlyAiring) score += 25;
  if (hit.mountain.time) score += 8;
  if (hit.mountain.days.length) score += 4;
  if (hit.status === "Running") score += 3;
  return score;
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
 * TVMaze text search often misses host-prefixed titles ("Bobby Flay's The Line"
 * won't appear for "The Line"). Scan the US broadcast schedule for phrase matches.
 */
async function findShowIdsOnUsSchedule(query: string): Promise<number[]> {
  const dates = Array.from({ length: 10 }, (_, i) => mountainDateString(i));
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
    }
  }
  return ids;
}

/** If the query includes a person name, pull their cast shows that match the title. */
async function findShowIdsFromPeople(query: string): Promise<number[]> {
  const q = query.trim();
  if (q.split(/\s+/).length < 2) return [];

  try {
    const people = await fetchJson<
      Array<{ person: { id: number; name: string } }>
    >(`https://api.tvmaze.com/search/people?q=${encodeURIComponent(q)}`);
    const top = people.slice(0, 3);
    const ids: number[] = [];
    const seen = new Set<number>();

    await Promise.all(
      top.map(async ({ person }) => {
        try {
          const credits = await fetchJson<
            Array<{ _embedded?: { show?: RawShow | null } }>
          >(
            `https://api.tvmaze.com/people/${person.id}/castcredits?embed=show`,
          );
          for (const credit of credits) {
            const show = credit._embedded?.show;
            if (!show?.id || !show.name) continue;
            if (!titleMatchesQuery(show.name, q)) continue;
            if (seen.has(show.id)) continue;
            seen.add(show.id);
            ids.push(show.id);
          }
        } catch {
          // ignore person credit failures
        }
      }),
    );
    return ids;
  } catch {
    return [];
  }
}

async function enrichShows(ids: number[]): Promise<TvMazeSearchHit[]> {
  const unique = [...new Set(ids)].slice(0, 16);
  const hits = await Promise.all(
    unique.map(async (id) => {
      try {
        const detail = await fetchShowWithEpisodes(id);
        return detail ? mapTvMazeShow(detail) : null;
      } catch {
        return null;
      }
    }),
  );
  return hits.filter((h): h is TvMazeSearchHit => Boolean(h));
}

export async function searchTvShows(query: string): Promise<TvMazeSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [data, scheduleIds, peopleIds] = await Promise.all([
    fetchJson<Array<{ show: RawShow; score: number }>>(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`,
    ),
    findShowIdsOnUsSchedule(q),
    findShowIdsFromPeople(q),
  ]);

  const primaryIds = data.slice(0, 12).map((row) => row.show.id);
  const mergedIds = [...primaryIds, ...scheduleIds, ...peopleIds];
  const enriched = await enrichShows(mergedIds);

  return enriched
    .sort((a, b) => rankHit(b, q) - rankHit(a, q))
    .slice(0, 10);
}

export async function lookupTvShow(tvmazeId: number): Promise<TvMazeSearchHit | null> {
  const show = await fetchShowWithEpisodes(tvmazeId);
  if (!show) return null;

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

  return mapTvMazeShow(show, recent);
}
