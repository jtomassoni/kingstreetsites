import type { MovieVote, MovieVoter } from "@movies/types";

export function isMovieVote(v: string): v is MovieVote {
  return v === "up" || v === "down";
}

export function isMovieVoter(v: string): v is MovieVoter {
  return v === "james" || v === "mary";
}

export function voterFromEmail(email: string): MovieVoter | null {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.includes("mary")) return "mary";
  if (
    local.includes("james") ||
    local.includes("jt") ||
    local.includes("tomassoni")
  ) {
    return "james";
  }
  return null;
}

export function voterLabel(voter: MovieVoter): string {
  return voter === "james" ? "James" : "Mary";
}
