"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import {
  deleteShowStream,
  deleteWatchingShow,
  getWatchingShow,
  insertWatchingShow,
  listWatchingShows,
  updateWatchingShow,
  upsertShowStream,
} from "@movies/lib/shows";
import {
  isWatchPlatformId,
  normalizeWatchPlatform,
  suggestedWatchPlatforms,
  watchPlatformLabel,
} from "@movies/lib/platforms";
import {
  isWeekday,
  resolveDisplayTimeZone,
  type Weekday,
} from "@movies/lib/timezone";
import { lookupTvShow, searchTvShows } from "@movies/lib/tvmaze";
import type { WatchingShow, WatchingStatus } from "@movies/types";

function revalidateMovies() {
  revalidatePath("/tools/movies");
}

export async function searchShowsAction(
  query: string,
  displayTimeZone?: string | null,
): Promise<{
  results?: Awaited<ReturnType<typeof searchTvShows>>;
  error?: string;
}> {
  await requireHouseholdContext();
  try {
    const results = await searchTvShows(
      query,
      resolveDisplayTimeZone(displayTimeZone),
    );
    return { results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Search failed" };
  }
}

export async function listShowsAction(
  statuses: WatchingStatus[] = ["watching"],
): Promise<{ shows?: WatchingShow[]; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const shows = await listWatchingShows(householdId, statuses);
    return { shows };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load shows" };
  }
}

export type AddShowInput = {
  tvmazeId?: number | null;
  title: string;
  imageUrl?: string | null;
  network?: string | null;
  summary?: string | null;
  /** Required — where you actually watch. */
  watchPlatform: string;
  /** Optional overrides; default is TVMaze schedule in displayTimeZone. */
  airDays?: string[];
  airTimeLocal?: string | null;
  /** Browser/locale IANA zone for local drop times. */
  displayTimeZone?: string | null;
  notes?: string | null;
};

export async function addShowAction(
  input: AddShowInput,
): Promise<{ show?: WatchingShow; error?: string }> {
  const title = input.title.trim();
  if (!title) return { error: "Title is required." };
  const watchPlatform = normalizeWatchPlatform(input.watchPlatform);
  if (!watchPlatform || !isWatchPlatformId(watchPlatform)) {
    return { error: "Pick where you watch this (Max, Disney+, etc.)." };
  }

  const displayTz = resolveDisplayTimeZone(input.displayTimeZone);

  try {
    const { user, householdId } = await requireHouseholdContext();

    if (!input.tvmazeId) {
      return { error: "Pick a show from search so we can check if it’s airing." };
    }

    const fresh = await lookupTvShow(input.tvmazeId, displayTz);
    if (!fresh) return { error: "Could not load that show from TVMaze." };

    if (!fresh.currentlyAiring) {
      return {
        error: `${fresh.title} isn’t airing right now (${fresh.airingLabel}). It can’t be added to the calendar.`,
      };
    }

    const allowed = suggestedWatchPlatforms(fresh.network);
    if (!allowed.includes(watchPlatform)) {
      return {
        error: `${fresh.title} isn’t available on that service — pick one that fits.`,
      };
    }

    const overrideDays = (input.airDays ?? []).filter(isWeekday) as Weekday[];
    const overrideTime = input.airTimeLocal ?? null;
    const airDays =
      overrideDays.length > 0 ? overrideDays : fresh.mountain.days;
    const airTimeLocal =
      overrideTime ||
      (overrideDays.length > 0 ? null : fresh.mountain.time);
    if (!airDays.length && !airTimeLocal) {
      return {
        error:
          "TVMaze doesn’t list a night/time for this show yet — try Sync later.",
      };
    }

    const show = await insertWatchingShow(householdId, user.id, {
      tvmazeId: fresh.tvmazeId,
      title: title || fresh.title,
      imageUrl: input.imageUrl ?? fresh.imageUrl,
      network: input.network ?? fresh.network,
      summary: input.summary ?? fresh.summary,
      currentlyAiring: true,
      tvStatus: fresh.status,
      nextAirAt: fresh.nextAirAt,
      airDays,
      airTimeLocal,
      listedAirDays: fresh.mountain.days,
      listedAirTimeLocal: fresh.mountain.time,
      watchPlatform,
      scheduleLocked: true,
      sourceTimezone: fresh.source.timezone,
      timezone: displayTz,
      notes: input.notes ?? null,
    });
    revalidateMovies();
    return { show };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not add show";
    if (message.includes("watching_shows_household_tvmaze_unique")) {
      return { error: "That show is already on your list." };
    }
    return { error: message };
  }
}

export async function syncShowScheduleAction(id: string): Promise<{
  show?: WatchingShow;
  label?: string | null;
  error?: string;
}> {
  try {
    const { householdId } = await requireHouseholdContext();
    const existing = await getWatchingShow(householdId, id);
    if (!existing) return { error: "Show not found." };
    if (!existing.tvmaze_id) {
      return { error: "This show has no TVMaze link to sync from." };
    }

    const displayTz = resolveDisplayTimeZone(existing.timezone);
    const fresh = await lookupTvShow(existing.tvmaze_id, displayTz);
    if (!fresh) return { error: "TVMaze has no listing for this show." };

    const listedDays = fresh.mountain.days.length
      ? fresh.mountain.days
      : existing.listed_air_days;
    const listedTime =
      fresh.mountain.time !== null
        ? fresh.mountain.time
        : existing.listed_air_time_local;

    // Platform (subscriber) is the override; nights/times always follow TVMaze in locale TZ.
    const airDays = fresh.mountain.days.length
      ? fresh.mountain.days
      : existing.air_days;
    const airTimeLocal =
      fresh.mountain.time !== null
        ? fresh.mountain.time
        : existing.air_time_local;
    const keepPlatform = Boolean(
      existing.schedule_locked && existing.watch_platform,
    );

    if (!fresh.currentlyAiring) {
      const show = await updateWatchingShow(householdId, id, {
        currentlyAiring: false,
        tvStatus: fresh.status,
        nextAirAt: null,
        airDays,
        airTimeLocal,
        listedAirDays: listedDays,
        listedAirTimeLocal: listedTime,
        sourceTimezone: fresh.source.timezone,
        timezone: displayTz,
        network: fresh.network,
        imageUrl: fresh.imageUrl ?? existing.image_url,
        summary: fresh.summary ?? existing.summary,
      });
      if (!show) return { error: "Show not found." };
      revalidateMovies();
      return {
        show,
        label: keepPlatform
          ? `${watchPlatformLabel(existing.watch_platform) ?? "Watch"} · ${fresh.airingLabel}`
          : fresh.airingLabel,
      };
    }

    const show = await updateWatchingShow(householdId, id, {
      currentlyAiring: true,
      tvStatus: fresh.status,
      nextAirAt: fresh.nextAirAt,
      airDays,
      airTimeLocal,
      listedAirDays: listedDays,
      listedAirTimeLocal: listedTime,
      sourceTimezone: fresh.source.timezone,
      timezone: displayTz,
      network: fresh.network,
      imageUrl: fresh.imageUrl ?? existing.image_url,
      summary: fresh.summary ?? existing.summary,
    });
    if (!show) return { error: "Show not found." };
    revalidateMovies();
    return {
      show,
      label: keepPlatform
        ? `${watchPlatformLabel(existing.watch_platform) ?? "Watch"} · ${fresh.mountain.label ?? "updated"}`
        : fresh.mountain.label,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed" };
  }
}

export async function syncAllSchedulesAction(): Promise<{
  updated?: number;
  skipped?: number;
  offCalendar?: number;
  overridesKept?: number;
  error?: string;
}> {
  try {
    const { householdId } = await requireHouseholdContext();
    const shows = await listWatchingShows(householdId, ["watching"]);
    let updated = 0;
    let skipped = 0;
    let offCalendar = 0;
    let overridesKept = 0;

    for (const show of shows) {
      if (!show.tvmaze_id) {
        skipped += 1;
        continue;
      }
      const displayTz = resolveDisplayTimeZone(show.timezone);
      const fresh = await lookupTvShow(show.tvmaze_id, displayTz);
      if (!fresh) {
        skipped += 1;
        continue;
      }

      const listedDays = fresh.mountain.days.length
        ? fresh.mountain.days
        : show.listed_air_days;
      const listedTime =
        fresh.mountain.time !== null
          ? fresh.mountain.time
          : show.listed_air_time_local;
      if (show.schedule_locked && show.watch_platform) overridesKept += 1;

      const airDays = fresh.mountain.days.length
        ? fresh.mountain.days
        : show.air_days;
      const airTimeLocal =
        fresh.mountain.time !== null
          ? fresh.mountain.time
          : show.air_time_local;

      if (!fresh.currentlyAiring) {
        await updateWatchingShow(householdId, show.id, {
          currentlyAiring: false,
          tvStatus: fresh.status,
          nextAirAt: null,
          airDays,
          airTimeLocal,
          listedAirDays: listedDays,
          listedAirTimeLocal: listedTime,
          sourceTimezone: fresh.source.timezone,
          timezone: displayTz,
          network: fresh.network,
          imageUrl: fresh.imageUrl ?? show.image_url,
          summary: fresh.summary ?? show.summary,
        });
        offCalendar += 1;
        updated += 1;
        continue;
      }

      await updateWatchingShow(householdId, show.id, {
        currentlyAiring: true,
        tvStatus: fresh.status,
        nextAirAt: fresh.nextAirAt,
        airDays,
        airTimeLocal,
        listedAirDays: listedDays,
        listedAirTimeLocal: listedTime,
        sourceTimezone: fresh.source.timezone,
        timezone: displayTz,
        network: fresh.network,
        imageUrl: fresh.imageUrl ?? show.image_url,
        summary: fresh.summary ?? show.summary,
      });
      updated += 1;
    }

    revalidateMovies();
    return { updated, skipped, offCalendar, overridesKept };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed" };
  }
}

export async function updateShowScheduleAction(input: {
  id: string;
  watchPlatform: string;
  /** Optional — omit to keep the listed drop night/time. */
  airDays?: string[];
  airTimeLocal?: string | null;
  notes?: string | null;
}): Promise<{ show?: WatchingShow; error?: string }> {
  const watchPlatform = normalizeWatchPlatform(input.watchPlatform);
  if (!watchPlatform) {
    return { error: "Pick a streaming service." };
  }

  try {
    const { householdId } = await requireHouseholdContext();
    const existing = await getWatchingShow(householdId, input.id);
    if (!existing) return { error: "Show not found." };
    if (!existing.currently_airing) {
      return {
        error:
          "This show isn’t airing right now, so it can’t be put on the calendar. Sync later when new episodes are announced.",
      };
    }

    const allowed = suggestedWatchPlatforms(existing.network);
    if (!allowed.includes(watchPlatform)) {
      return {
        error: `${existing.title} isn’t available on that service — pick one that fits.`,
      };
    }

    const airDays =
      input.airDays !== undefined
        ? (input.airDays.filter(isWeekday) as Weekday[])
        : existing.air_days;
    const airTimeLocal =
      input.airTimeLocal !== undefined
        ? input.airTimeLocal
        : existing.air_time_local;
    if (!airDays.length && !airTimeLocal) {
      return { error: "No drop night/time on file for this show yet." };
    }

    const show = await upsertShowStream(householdId, input.id, {
      platform: watchPlatform,
      airDays,
      airTimeLocal,
      makePrimary: true,
      notes: input.notes,
    });
    if (!show) return { error: "Show not found." };
    revalidateMovies();
    return { show };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function saveShowStreamAction(input: {
  id: string;
  platform: string;
  airDays: string[];
  airTimeLocal: string | null;
  makePrimary?: boolean;
}): Promise<{ show?: WatchingShow; error?: string }> {
  const platform = normalizeWatchPlatform(input.platform);
  if (!platform) {
    return { error: "Pick a streaming service." };
  }
  const airDays = input.airDays.filter(isWeekday) as Weekday[];
  try {
    const { householdId } = await requireHouseholdContext();
    const show = await upsertShowStream(householdId, input.id, {
      platform,
      airDays,
      airTimeLocal: input.airTimeLocal,
      makePrimary: input.makePrimary !== false,
    });
    if (!show) return { error: "Show not found." };
    revalidateMovies();
    return { show };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function removeShowStreamAction(input: {
  id: string;
  platform: string;
}): Promise<{ show?: WatchingShow; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const show = await deleteShowStream(
      householdId,
      input.id,
      input.platform,
    );
    if (!show) return { error: "Show not found." };
    revalidateMovies();
    return { show };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Remove failed" };
  }
}

export async function setShowStatusAction(input: {
  id: string;
  status: WatchingStatus;
}): Promise<{ show?: WatchingShow; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const show = await updateWatchingShow(householdId, input.id, {
      status: input.status,
    });
    if (!show) return { error: "Show not found." };
    revalidateMovies();
    return { show };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function removeShowAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const ok = await deleteWatchingShow(householdId, id);
    if (!ok) return { error: "Show not found." };
    revalidateMovies();
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Remove failed" };
  }
}
