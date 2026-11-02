import { query, queryOne } from "@meals/lib/db";
import {
  HOUSEHOLD_TIMEZONE,
  isWeekday,
  normalizeTimeHHMM,
  type Weekday,
} from "@movies/lib/timezone";
import type { WatchingShow, WatchingStatus } from "@movies/types";

function mapRow(row: Record<string, unknown>): WatchingShow {
  const daysRaw = row.air_days;
  const days = Array.isArray(daysRaw)
    ? daysRaw.filter((d): d is Weekday => typeof d === "string" && isWeekday(d))
    : [];

  return {
    id: String(row.id),
    household_id: String(row.household_id),
    tvmaze_id:
      row.tvmaze_id === null || row.tvmaze_id === undefined
        ? null
        : Number(row.tvmaze_id),
    title: String(row.title),
    image_url: (row.image_url as string | null) ?? null,
    network: (row.network as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    status: row.status as WatchingStatus,
    currently_airing: row.currently_airing !== false,
    tv_status: (row.tv_status as string | null) ?? null,
    next_air_at: (row.next_air_at as string | null) ?? null,
    air_days: days,
    air_time_local: normalizeTimeHHMM(
      row.air_time_local === null || row.air_time_local === undefined
        ? null
        : String(row.air_time_local),
    ),
    source_timezone: (row.source_timezone as string | null) ?? null,
    timezone: String(row.timezone || HOUSEHOLD_TIMEZONE),
    notes: (row.notes as string | null) ?? null,
    added_by: (row.added_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listWatchingShows(
  householdId: string,
  statuses: WatchingStatus[] = ["watching"],
): Promise<WatchingShow[]> {
  const rows = await query<Record<string, unknown>>`
    SELECT *
    FROM watching_shows
    WHERE household_id = ${householdId}
      AND status = ANY(${statuses}::text[])
    ORDER BY
      currently_airing DESC,
      CASE WHEN air_time_local IS NULL THEN 1 ELSE 0 END,
      air_time_local ASC NULLS LAST,
      title ASC
  `;
  return rows.map(mapRow);
}

export async function getWatchingShow(
  householdId: string,
  id: string,
): Promise<WatchingShow | null> {
  const row = await queryOne<Record<string, unknown>>`
    SELECT * FROM watching_shows
    WHERE id = ${id} AND household_id = ${householdId}
    LIMIT 1
  `;
  return row ? mapRow(row) : null;
}

export type UpsertWatchingShowInput = {
  tvmazeId?: number | null;
  title: string;
  imageUrl?: string | null;
  network?: string | null;
  summary?: string | null;
  status?: WatchingStatus;
  currentlyAiring?: boolean;
  tvStatus?: string | null;
  nextAirAt?: string | null;
  airDays: Weekday[];
  airTimeLocal: string | null;
  sourceTimezone?: string | null;
  notes?: string | null;
};

export async function insertWatchingShow(
  householdId: string,
  userId: string,
  input: UpsertWatchingShowInput,
): Promise<WatchingShow> {
  const airDays = input.airDays.filter(isWeekday);
  const airTime = normalizeTimeHHMM(input.airTimeLocal);
  const status = input.status ?? "watching";
  const currentlyAiring = input.currentlyAiring !== false;

  const row = await queryOne<Record<string, unknown>>`
    INSERT INTO watching_shows (
      household_id,
      tvmaze_id,
      title,
      image_url,
      network,
      summary,
      status,
      currently_airing,
      tv_status,
      next_air_at,
      air_days,
      air_time_local,
      source_timezone,
      timezone,
      notes,
      added_by
    ) VALUES (
      ${householdId},
      ${input.tvmazeId ?? null},
      ${input.title.trim()},
      ${input.imageUrl ?? null},
      ${input.network ?? null},
      ${input.summary ?? null},
      ${status},
      ${currentlyAiring},
      ${input.tvStatus ?? null},
      ${input.nextAirAt ?? null},
      ${airDays}::text[],
      ${airTime}::time,
      ${input.sourceTimezone ?? null},
      ${HOUSEHOLD_TIMEZONE},
      ${input.notes?.trim() || null},
      ${userId}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Failed to save show");
  return mapRow(row);
}

export async function updateWatchingShow(
  householdId: string,
  id: string,
  patch: Partial<UpsertWatchingShowInput> & { status?: WatchingStatus },
): Promise<WatchingShow | null> {
  const existing = await getWatchingShow(householdId, id);
  if (!existing) return null;

  const title = patch.title?.trim() || existing.title;
  const airDays = patch.airDays
    ? patch.airDays.filter(isWeekday)
    : existing.air_days;
  const airTime =
    patch.airTimeLocal !== undefined
      ? normalizeTimeHHMM(patch.airTimeLocal)
      : existing.air_time_local;
  const status = patch.status ?? existing.status;
  const notes =
    patch.notes !== undefined
      ? patch.notes?.trim() || null
      : existing.notes;
  const currentlyAiring =
    patch.currentlyAiring !== undefined
      ? patch.currentlyAiring
      : existing.currently_airing;
  const tvStatus =
    patch.tvStatus !== undefined ? patch.tvStatus : existing.tv_status;
  const nextAirAt =
    patch.nextAirAt !== undefined ? patch.nextAirAt : existing.next_air_at;

  const row = await queryOne<Record<string, unknown>>`
    UPDATE watching_shows SET
      title = ${title},
      image_url = ${patch.imageUrl !== undefined ? patch.imageUrl : existing.image_url},
      network = ${patch.network !== undefined ? patch.network : existing.network},
      summary = ${patch.summary !== undefined ? patch.summary : existing.summary},
      status = ${status},
      currently_airing = ${currentlyAiring},
      tv_status = ${tvStatus},
      next_air_at = ${nextAirAt},
      air_days = ${airDays}::text[],
      air_time_local = ${airTime}::time,
      source_timezone = ${
        patch.sourceTimezone !== undefined
          ? patch.sourceTimezone
          : existing.source_timezone
      },
      notes = ${notes}
    WHERE id = ${id} AND household_id = ${householdId}
    RETURNING *
  `;
  return row ? mapRow(row) : null;
}

export async function deleteWatchingShow(
  householdId: string,
  id: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>`
    DELETE FROM watching_shows
    WHERE id = ${id} AND household_id = ${householdId}
    RETURNING id
  `;
  return Boolean(row);
}
