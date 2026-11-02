"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import {
  deleteWatchingShow,
  getWatchingShow,
  insertWatchingShow,
  listWatchingShows,
  updateWatchingShow,
} from "@movies/lib/shows";
import { isWeekday, type Weekday } from "@movies/lib/timezone";
import { lookupTvShow, searchTvShows } from "@movies/lib/tvmaze";
import type { WatchingShow, WatchingStatus } from "@movies/types";

function revalidateMovies() {
  revalidatePath("/tools/movies");
}

export async function searchShowsAction(query: string): Promise<{
  results?: Awaited<ReturnType<typeof searchTvShows>>;
  error?: string;
}> {
  await requireHouseholdContext();
  try {
    const results = await searchTvShows(query);
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
  /** When false/omitted and tvmazeId is set, schedule is taken from TVMaze → MT. */
  manualSchedule?: boolean;
  airDays?: string[];
  airTimeLocal?: string | null;
  sourceTimezone?: string | null;
  notes?: string | null;
};

export async function addShowAction(
  input: AddShowInput,
): Promise<{ show?: WatchingShow; error?: string }> {
  const title = input.title.trim();
  if (!title) return { error: "Title is required." };

  try {
    const { user, householdId } = await requireHouseholdContext();

    if (!input.tvmazeId) {
      return { error: "Pick a show from search so we can check if it’s airing." };
    }

    const fresh = await lookupTvShow(input.tvmazeId);
    if (!fresh) return { error: "Could not load that show from TVMaze." };

    if (!fresh.currentlyAiring) {
      return {
        error: `${fresh.title} isn’t airing right now (${fresh.airingLabel}). It can’t be added to the calendar.`,
      };
    }

    const useManual = Boolean(input.manualSchedule);
    const payload = {
      tvmazeId: fresh.tvmazeId,
      title: title || fresh.title,
      imageUrl: input.imageUrl ?? fresh.imageUrl,
      network: input.network ?? fresh.network,
      summary: input.summary ?? fresh.summary,
      currentlyAiring: true,
      tvStatus: fresh.status,
      nextAirAt: fresh.nextAirAt,
      airDays: useManual
        ? ((input.airDays ?? []).filter(isWeekday) as Weekday[])
        : fresh.mountain.days,
      airTimeLocal: useManual
        ? (input.airTimeLocal ?? null)
        : fresh.mountain.time,
      sourceTimezone: fresh.source.timezone,
      notes: input.notes ?? null,
    };

    if (!payload.airDays.length && !payload.airTimeLocal) {
      return {
        error: `${fresh.title} is airing but has no weekly night/time to put on the calendar.`,
      };
    }

    const show = await insertWatchingShow(householdId, user.id, payload);
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

    const fresh = await lookupTvShow(existing.tvmaze_id);
    if (!fresh) return { error: "TVMaze has no listing for this show." };

    if (!fresh.currentlyAiring) {
      const show = await updateWatchingShow(householdId, id, {
        currentlyAiring: false,
        tvStatus: fresh.status,
        nextAirAt: null,
        // Keep typical nights/time for when the season returns, but calendar ignores them.
        airDays: fresh.mountain.days.length
          ? fresh.mountain.days
          : existing.air_days,
        airTimeLocal:
          fresh.mountain.time !== null
            ? fresh.mountain.time
            : existing.air_time_local,
        sourceTimezone: fresh.source.timezone,
        network: fresh.network,
        imageUrl: fresh.imageUrl ?? existing.image_url,
        summary: fresh.summary ?? existing.summary,
      });
      if (!show) return { error: "Show not found." };
      revalidateMovies();
      return {
        show,
        label: fresh.airingLabel,
        error: undefined,
      };
    }

    const show = await updateWatchingShow(householdId, id, {
      currentlyAiring: true,
      tvStatus: fresh.status,
      nextAirAt: fresh.nextAirAt,
      airDays: fresh.mountain.days,
      airTimeLocal: fresh.mountain.time,
      sourceTimezone: fresh.source.timezone,
      network: fresh.network,
      imageUrl: fresh.imageUrl ?? existing.image_url,
      summary: fresh.summary ?? existing.summary,
    });
    if (!show) return { error: "Show not found." };
    revalidateMovies();
    return { show, label: fresh.mountain.label };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed" };
  }
}

export async function syncAllSchedulesAction(): Promise<{
  updated?: number;
  skipped?: number;
  offCalendar?: number;
  error?: string;
}> {
  try {
    const { householdId } = await requireHouseholdContext();
    const shows = await listWatchingShows(householdId, ["watching"]);
    let updated = 0;
    let skipped = 0;
    let offCalendar = 0;

    for (const show of shows) {
      if (!show.tvmaze_id) {
        skipped += 1;
        continue;
      }
      const fresh = await lookupTvShow(show.tvmaze_id);
      if (!fresh) {
        skipped += 1;
        continue;
      }

      if (!fresh.currentlyAiring) {
        await updateWatchingShow(householdId, show.id, {
          currentlyAiring: false,
          tvStatus: fresh.status,
          nextAirAt: null,
          airDays: fresh.mountain.days.length
            ? fresh.mountain.days
            : show.air_days,
          airTimeLocal:
            fresh.mountain.time !== null
              ? fresh.mountain.time
              : show.air_time_local,
          sourceTimezone: fresh.source.timezone,
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
        airDays: fresh.mountain.days,
        airTimeLocal: fresh.mountain.time,
        sourceTimezone: fresh.source.timezone,
        network: fresh.network,
        imageUrl: fresh.imageUrl ?? show.image_url,
        summary: fresh.summary ?? show.summary,
      });
      updated += 1;
    }

    revalidateMovies();
    return { updated, skipped, offCalendar };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed" };
  }
}

export async function updateShowScheduleAction(input: {
  id: string;
  airDays: string[];
  airTimeLocal: string | null;
  notes?: string | null;
}): Promise<{ show?: WatchingShow; error?: string }> {
  const airDays = input.airDays.filter(isWeekday) as Weekday[];
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
    const show = await updateWatchingShow(householdId, input.id, {
      airDays,
      airTimeLocal: input.airTimeLocal,
      notes: input.notes,
    });
    if (!show) return { error: "Show not found." };
    revalidateMovies();
    return { show };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
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
