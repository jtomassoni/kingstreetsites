import { describe, expect, it } from "vitest";
import {
  defaultWatchPlatform,
  suggestedWatchPlatforms,
} from "../../modules/movies/lib/platforms";

describe("suggestedWatchPlatforms", () => {
  it("limits Netflix originals to Netflix (+ Other)", () => {
    expect(suggestedWatchPlatforms("Netflix")).toEqual(["netflix", "other"]);
    expect(defaultWatchPlatform("Netflix")).toBe("netflix");
  });

  it("maps Hulu / Disney+ to Disney+", () => {
    expect(suggestedWatchPlatforms("Hulu")).toEqual(["disney_plus", "other"]);
    expect(suggestedWatchPlatforms("Disney+")).toEqual([
      "disney_plus",
      "other",
    ]);
    expect(defaultWatchPlatform("Hulu")).toBe("disney_plus");
  });

  it("maps Max / HBO to Max", () => {
    expect(suggestedWatchPlatforms("Max")).toEqual(["max", "other"]);
    expect(suggestedWatchPlatforms("HBO")).toEqual(["max", "other"]);
  });

  it("keeps the full list for broadcast networks (FOX may be Max or live)", () => {
    const fox = suggestedWatchPlatforms("FOX");
    expect(fox).toContain("max");
    expect(fox).toContain("youtube_tv");
    expect(defaultWatchPlatform("FOX")).toBeNull();
  });

  it("falls back to the full list when the network is unknown", () => {
    const all = suggestedWatchPlatforms("Some Indie Channel");
    expect(all).toContain("netflix");
    expect(all).toContain("max");
    expect(all.length).toBeGreaterThan(5);
  });
});
