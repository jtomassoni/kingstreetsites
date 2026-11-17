import { query, queryOne } from "@meals/lib/db";
import type {
  MovieVote,
  MovieVoter,
  MovieWishlistItem,
  MovieWishlistStatus,
} from "@movies/types";

export {
  isMovieVote,
  isMovieVoter,
  voterFromEmail,
  voterLabel,
} from "@movies/lib/voters";

function mapRow(row: Record<string, unknown>): MovieWishlistItem {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    title: String(row.title),
    year:
      row.year === null || row.year === undefined ? null : Number(row.year),
    notes: (row.notes as string | null) ?? null,
    status: row.status as MovieWishlistStatus,
    james_vote: (row.james_vote as MovieVote | null) ?? null,
    mary_vote: (row.mary_vote as MovieVote | null) ?? null,
    watched_at: (row.watched_at as string | null) ?? null,
    added_by: (row.added_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listWishlistItems(
  householdId: string,
  statuses?: MovieWishlistStatus[],
): Promise<MovieWishlistItem[]> {
  const statusFilter = statuses?.length
    ? statuses
    : (["wishlist", "watched"] as MovieWishlistStatus[]);

  const rows = await query<Record<string, unknown>>`
    SELECT *
    FROM movie_wishlist
    WHERE household_id = ${householdId}
      AND status = ANY(${statusFilter}::text[])
    ORDER BY
      CASE WHEN status = 'wishlist' THEN 0 ELSE 1 END,
      COALESCE(watched_at, created_at) DESC,
      created_at DESC
  `;
  return rows.map(mapRow);
}

export async function getWishlistItem(
  householdId: string,
  id: string,
): Promise<MovieWishlistItem | null> {
  const row = await queryOne<Record<string, unknown>>`
    SELECT *
    FROM movie_wishlist
    WHERE household_id = ${householdId}
      AND id = ${id}
    LIMIT 1
  `;
  return row ? mapRow(row) : null;
}

export async function insertWishlistItem(
  householdId: string,
  addedBy: string | null,
  input: {
    title: string;
    year?: number | null;
    notes?: string | null;
  },
): Promise<MovieWishlistItem> {
  const row = await queryOne<Record<string, unknown>>`
    INSERT INTO movie_wishlist (
      household_id,
      title,
      year,
      notes,
      added_by
    )
    VALUES (
      ${householdId},
      ${input.title},
      ${input.year ?? null},
      ${input.notes ?? null},
      ${addedBy}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Could not add movie.");
  return mapRow(row);
}

export async function updateWishlistItem(
  householdId: string,
  id: string,
  patch: {
    title?: string;
    year?: number | null;
    notes?: string | null;
    status?: MovieWishlistStatus;
    james_vote?: MovieVote | null;
    mary_vote?: MovieVote | null;
    watched_at?: string | null;
  },
): Promise<MovieWishlistItem | null> {
  const existing = await getWishlistItem(householdId, id);
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const year = patch.year !== undefined ? patch.year : existing.year;
  const notes = patch.notes !== undefined ? patch.notes : existing.notes;
  const status = patch.status ?? existing.status;
  const jamesVote =
    patch.james_vote !== undefined ? patch.james_vote : existing.james_vote;
  const maryVote =
    patch.mary_vote !== undefined ? patch.mary_vote : existing.mary_vote;
  let watchedAt =
    patch.watched_at !== undefined ? patch.watched_at : existing.watched_at;
  if (status === "watched" && !watchedAt) {
    watchedAt = new Date().toISOString();
  }
  if (status === "wishlist") {
    watchedAt = null;
  }

  const row = await queryOne<Record<string, unknown>>`
    UPDATE movie_wishlist
    SET
      title = ${title},
      year = ${year},
      notes = ${notes},
      status = ${status},
      james_vote = ${jamesVote},
      mary_vote = ${maryVote},
      watched_at = ${watchedAt}
    WHERE household_id = ${householdId}
      AND id = ${id}
    RETURNING *
  `;
  return row ? mapRow(row) : null;
}

export async function setWishlistVote(
  householdId: string,
  id: string,
  voter: MovieVoter,
  vote: MovieVote | null,
): Promise<MovieWishlistItem | null> {
  const existing = await getWishlistItem(householdId, id);
  if (!existing) return null;

  if (existing.status !== "watched") {
    return updateWishlistItem(householdId, id, {
      status: "watched",
      james_vote: voter === "james" ? vote : existing.james_vote,
      mary_vote: voter === "mary" ? vote : existing.mary_vote,
    });
  }

  return updateWishlistItem(householdId, id, {
    james_vote: voter === "james" ? vote : undefined,
    mary_vote: voter === "mary" ? vote : undefined,
  });
}

export async function deleteWishlistItem(
  householdId: string,
  id: string,
): Promise<boolean> {
  const row = await queryOne<Record<string, unknown>>`
    DELETE FROM movie_wishlist
    WHERE household_id = ${householdId}
      AND id = ${id}
    RETURNING id
  `;
  return Boolean(row);
}
