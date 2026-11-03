import { query, queryOne } from "@meals/lib/db";
import { normalizeWatchPlatform } from "@movies/lib/platforms";
import {
  HOUSEHOLD_TIMEZONE,
  isWeekday,
  normalizeTimeHHMM,
  type Weekday,
} from "@movies/lib/timezone";
import type {
  WatchingShow,
  WatchingShowStream,
  WatchingStatus,
} from "@movies/types";

function mapDays(raw: unknown): Weekday[] {
  return Array.isArray(raw)
    ? raw.filter((d): d is Weekday => typeof d === "string" && isWeekday(d))
    : [];
}

function mapStreamRow(row: Record<string, unknown>): WatchingShowStream {
  return {
    id: String(row.id),
    show_id: String(row.show_id),
    household_id: String(row.household_id),
    platform:
      normalizeWatchPlatform(String(row.platform)) ?? String(row.platform),
    air_days: mapDays(row.air_days),
    air_time_local: normalizeTimeHHMM(
      row.air_time_local === null || row.air_time_local === undefined
        ? null
        : String(row.air_time_local),
    ),
    is_primary: row.is_primary === true,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRow(
  row: Record<string, unknown>,
  streams: WatchingShowStream[] = [],
): WatchingShow {
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
    air_days: mapDays(row.air_days),
    air_time_local: normalizeTimeHHMM(
      row.air_time_local === null || row.air_time_local === undefined
        ? null
        : String(row.air_time_local),
    ),
    watch_platform:
      normalizeWatchPlatform(
        (row.watch_platform as string | null) ?? null,
      ) ?? ((row.watch_platform as string | null) ?? null),
    schedule_locked: row.schedule_locked === true,
    listed_air_days: mapDays(row.listed_air_days),
    listed_air_time_local: normalizeTimeHHMM(
      row.listed_air_time_local === null ||
        row.listed_air_time_local === undefined
        ? null
        : String(row.listed_air_time_local),
    ),
    source_timezone: (row.source_timezone as string | null) ?? null,
    timezone: String(row.timezone || HOUSEHOLD_TIMEZONE),
    notes: (row.notes as string | null) ?? null,
    added_by: (row.added_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    streams,
  };
}

async function listStreamsForShows(
  householdId: string,
  showIds: string[],
): Promise<Map<string, WatchingShowStream[]>> {
  const map = new Map<string, WatchingShowStream[]>();
  if (showIds.length === 0) return map;

  const rows = await query<Record<string, unknown>>`
    SELECT *
    FROM watching_show_streams
    WHERE household_id = ${householdId}
      AND show_id = ANY(${showIds}::uuid[])
    ORDER BY is_primary DESC, platform ASC
  `;

  for (const row of rows) {
    const stream = mapStreamRow(row);
    const list = map.get(stream.show_id) ?? [];
    list.push(stream);
    map.set(stream.show_id, list);
  }
  return map;
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
  const streamsByShow = await listStreamsForShows(
    householdId,
    rows.map((r) => String(r.id)),
  );
  return rows.map((row) =>
    mapRow(row, streamsByShow.get(String(row.id)) ?? []),
  );
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
  if (!row) return null;
  const streamsByShow = await listStreamsForShows(householdId, [id]);
  return mapRow(row, streamsByShow.get(id) ?? []);
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
  listedAirDays?: Weekday[];
  listedAirTimeLocal?: string | null;
  watchPlatform?: string | null;
  scheduleLocked?: boolean;
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
  const listedDays = (input.listedAirDays ?? airDays).filter(isWeekday);
  const listedTime =
    input.listedAirTimeLocal !== undefined
      ? normalizeTimeHHMM(input.listedAirTimeLocal)
      : airTime;
  const status = input.status ?? "watching";
  const currentlyAiring = input.currentlyAiring !== false;
  const scheduleLocked = input.scheduleLocked === true;
  const watchPlatform = input.watchPlatform?.trim() || null;

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
      listed_air_days,
      listed_air_time_local,
      watch_platform,
      schedule_locked,
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
      ${listedDays}::text[],
      ${listedTime}::time,
      ${watchPlatform},
      ${scheduleLocked},
      ${input.sourceTimezone ?? null},
      ${HOUSEHOLD_TIMEZONE},
      ${input.notes?.trim() || null},
      ${userId}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Failed to save show");

  const showId = String(row.id);
  if (watchPlatform && scheduleLocked) {
    await upsertPrimaryStream(householdId, showId, {
      platform: watchPlatform,
      airDays,
      airTimeLocal: airTime,
    });
  }

  return (await getWatchingShow(householdId, showId))!;
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
  const listedDays = patch.listedAirDays
    ? patch.listedAirDays.filter(isWeekday)
    : existing.listed_air_days;
  const listedTime =
    patch.listedAirTimeLocal !== undefined
      ? normalizeTimeHHMM(patch.listedAirTimeLocal)
      : existing.listed_air_time_local;
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
  const watchPlatform =
    patch.watchPlatform !== undefined
      ? patch.watchPlatform?.trim() || null
      : existing.watch_platform;
  const scheduleLocked =
    patch.scheduleLocked !== undefined
      ? patch.scheduleLocked
      : existing.schedule_locked;

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
      listed_air_days = ${listedDays}::text[],
      listed_air_time_local = ${listedTime}::time,
      watch_platform = ${watchPlatform},
      schedule_locked = ${scheduleLocked},
      source_timezone = ${
        patch.sourceTimezone !== undefined
          ? patch.sourceTimezone
          : existing.source_timezone
      },
      notes = ${notes}
    WHERE id = ${id} AND household_id = ${householdId}
    RETURNING *
  `;
  if (!row) return null;

  if (
    scheduleLocked &&
    watchPlatform &&
    (patch.airDays !== undefined ||
      patch.airTimeLocal !== undefined ||
      patch.watchPlatform !== undefined ||
      patch.scheduleLocked !== undefined)
  ) {
    await upsertPrimaryStream(householdId, id, {
      platform: watchPlatform,
      airDays,
      airTimeLocal: airTime,
    });
  }

  return getWatchingShow(householdId, id);
}

async function upsertPrimaryStream(
  householdId: string,
  showId: string,
  input: {
    platform: string;
    airDays: Weekday[];
    airTimeLocal: string | null;
  },
): Promise<void> {
  const airDays = input.airDays.filter(isWeekday);
  const airTime = normalizeTimeHHMM(input.airTimeLocal);

  await query`
    UPDATE watching_show_streams
    SET is_primary = false
    WHERE show_id = ${showId}
      AND household_id = ${householdId}
      AND is_primary = true
      AND platform IS DISTINCT FROM ${input.platform}
  `;

  await query`
    INSERT INTO watching_show_streams (
      show_id,
      household_id,
      platform,
      air_days,
      air_time_local,
      is_primary
    ) VALUES (
      ${showId},
      ${householdId},
      ${input.platform},
      ${airDays}::text[],
      ${airTime}::time,
      true
    )
    ON CONFLICT (show_id, platform) DO UPDATE SET
      air_days = EXCLUDED.air_days,
      air_time_local = EXCLUDED.air_time_local,
      is_primary = true,
      updated_at = now()
  `;
}

export async function upsertShowStream(
  householdId: string,
  showId: string,
  input: {
    platform: string;
    airDays: Weekday[];
    airTimeLocal: string | null;
    makePrimary?: boolean;
    notes?: string | null;
  },
): Promise<WatchingShow | null> {
  const existing = await getWatchingShow(householdId, showId);
  if (!existing) return null;

  const airDays = input.airDays.filter(isWeekday);
  const airTime = normalizeTimeHHMM(input.airTimeLocal);
  const makePrimary = input.makePrimary !== false;

  if (makePrimary) {
    await query`
      UPDATE watching_show_streams
      SET is_primary = false
      WHERE show_id = ${showId}
        AND household_id = ${householdId}
        AND is_primary = true
        AND platform IS DISTINCT FROM ${input.platform}
    `;
  }

  await query`
    INSERT INTO watching_show_streams (
      show_id,
      household_id,
      platform,
      air_days,
      air_time_local,
      is_primary,
      notes
    ) VALUES (
      ${showId},
      ${householdId},
      ${input.platform},
      ${airDays}::text[],
      ${airTime}::time,
      ${makePrimary},
      ${input.notes?.trim() || null}
    )
    ON CONFLICT (show_id, platform) DO UPDATE SET
      air_days = EXCLUDED.air_days,
      air_time_local = EXCLUDED.air_time_local,
      is_primary = EXCLUDED.is_primary OR watching_show_streams.is_primary,
      notes = COALESCE(EXCLUDED.notes, watching_show_streams.notes),
      updated_at = now()
  `;

  if (makePrimary) {
    return updateWatchingShow(householdId, showId, {
      airDays,
      airTimeLocal: airTime,
      watchPlatform: input.platform,
      scheduleLocked: true,
    });
  }

  return getWatchingShow(householdId, showId);
}

export async function deleteShowStream(
  householdId: string,
  showId: string,
  platform: string,
): Promise<WatchingShow | null> {
  const existing = await getWatchingShow(householdId, showId);
  if (!existing) return null;

  const removed = existing.streams.find((s) => s.platform === platform);
  await query`
    DELETE FROM watching_show_streams
    WHERE show_id = ${showId}
      AND household_id = ${householdId}
      AND platform = ${platform}
  `;

  if (!removed?.is_primary) {
    return getWatchingShow(householdId, showId);
  }

  const remaining = existing.streams.filter((s) => s.platform !== platform);
  const nextPrimary = remaining[0];
  if (nextPrimary) {
    return upsertShowStream(householdId, showId, {
      platform: nextPrimary.platform,
      airDays: nextPrimary.air_days,
      airTimeLocal: nextPrimary.air_time_local,
      makePrimary: true,
      notes: nextPrimary.notes,
    });
  }

  return updateWatchingShow(householdId, showId, {
    watchPlatform: null,
    scheduleLocked: false,
    airDays: existing.listed_air_days,
    airTimeLocal: existing.listed_air_time_local,
  });
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
