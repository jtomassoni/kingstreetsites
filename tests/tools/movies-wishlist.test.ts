import { describe, expect, it } from "vitest";
import {
  isMovieVote,
  isMovieVoter,
  voterFromEmail,
  voterLabel,
} from "../../modules/movies/lib/voters";

describe("movie wishlist voters", () => {
  it("maps emails to james or mary", () => {
    expect(voterFromEmail("mary@example.com")).toBe("mary");
    expect(voterFromEmail("james@example.com")).toBe("james");
    expect(voterFromEmail("jt@example.com")).toBe("james");
    expect(voterFromEmail("friend@example.com")).toBeNull();
  });

  it("labels voters", () => {
    expect(voterLabel("james")).toBe("James");
    expect(voterLabel("mary")).toBe("Mary");
  });

  it("validates vote and voter values", () => {
    expect(isMovieVote("up")).toBe(true);
    expect(isMovieVote("down")).toBe(true);
    expect(isMovieVote("meh")).toBe(false);
    expect(isMovieVoter("james")).toBe(true);
    expect(isMovieVoter("mary")).toBe(true);
    expect(isMovieVoter("bob")).toBe(false);
  });
});
