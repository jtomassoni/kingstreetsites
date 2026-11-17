"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { isMovieVote, isMovieVoter } from "@movies/lib/voters";
import {
  deleteWishlistItem,
  getWishlistItem,
  insertWishlistItem,
  listWishlistItems,
  setWishlistVote,
  updateWishlistItem,
} from "@movies/lib/wishlist";
import type {
  MovieVote,
  MovieVoter,
  MovieWishlistItem,
  MovieWishlistStatus,
} from "@movies/types";

function revalidateMovies() {
  revalidatePath("/tools/movies");
}

function parseYear(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1888 || n > 2100) return null;
  return n;
}

export async function listWishlistAction(
  statuses?: MovieWishlistStatus[],
): Promise<{ items?: MovieWishlistItem[]; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const items = await listWishlistItems(householdId, statuses);
    return { items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not load wishlist" };
  }
}

export async function addWishlistItemAction(input: {
  title: string;
  year?: string | number | null;
  notes?: string | null;
}): Promise<{ item?: MovieWishlistItem; error?: string }> {
  const title = input.title.trim();
  if (!title) return { error: "Title is required." };
  if (title.length > 200) return { error: "Title is too long." };

  const year = parseYear(input.year);
  if (
    input.year !== null &&
    input.year !== undefined &&
    String(input.year).trim() !== "" &&
    year === null
  ) {
    return { error: "Year must be between 1888 and 2100." };
  }

  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) return { error: "Notes are too long." };

  try {
    const { user, householdId } = await requireHouseholdContext();
    const item = await insertWishlistItem(householdId, user.id, {
      title,
      year,
      notes,
    });
    revalidateMovies();
    return { item };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add movie" };
  }
}

export async function markWishlistWatchedAction(input: {
  id: string;
}): Promise<{ item?: MovieWishlistItem; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const existing = await getWishlistItem(householdId, input.id);
    if (!existing) return { error: "Movie not found." };
    const item = await updateWishlistItem(householdId, input.id, {
      status: "watched",
      watched_at: existing.watched_at ?? new Date().toISOString(),
    });
    if (!item) return { error: "Movie not found." };
    revalidateMovies();
    return { item };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not mark watched" };
  }
}

export async function restoreWishlistItemAction(input: {
  id: string;
}): Promise<{ item?: MovieWishlistItem; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const item = await updateWishlistItem(householdId, input.id, {
      status: "wishlist",
      james_vote: null,
      mary_vote: null,
      watched_at: null,
    });
    if (!item) return { error: "Movie not found." };
    revalidateMovies();
    return { item };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not restore" };
  }
}

export async function setWishlistVoteAction(input: {
  id: string;
  voter: string;
  vote: string | null;
}): Promise<{ item?: MovieWishlistItem; error?: string }> {
  if (!isMovieVoter(input.voter)) {
    return { error: "Pick James or Mary." };
  }
  let vote: MovieVote | null = null;
  if (input.vote !== null && input.vote !== "") {
    if (!isMovieVote(input.vote)) return { error: "Vote must be up or down." };
    vote = input.vote;
  }

  try {
    const { householdId } = await requireHouseholdContext();
    const item = await setWishlistVote(
      householdId,
      input.id,
      input.voter as MovieVoter,
      vote,
    );
    if (!item) return { error: "Movie not found." };
    revalidateMovies();
    return { item };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save vote" };
  }
}

export async function removeWishlistItemAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const { householdId } = await requireHouseholdContext();
    const ok = await deleteWishlistItem(householdId, id);
    if (!ok) return { error: "Movie not found." };
    revalidateMovies();
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not remove" };
  }
}
