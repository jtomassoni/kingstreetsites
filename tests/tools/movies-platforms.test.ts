import { describe, expect, it } from "vitest";
import {
  defaultWatchPlatform,
  needsWatchPlatformChoice,
  resolveStreamWatchSchedule,
  suggestedWatchPlatforms,
} from "../../modules/movies/lib/platforms";

describe("suggestedWatchPlatforms", () => {
  it("limits Netflix originals to Netflix (+ Other)", () => {
    expect(suggestedWatchPlatforms("Netflix")).toEqual(["netflix", "other"]);
    expect(defaultWatchPlatform("Netflix")).toBe("netflix");
    expect(needsWatchPlatformChoice("Netflix")).toBe(false);
  });

  it("maps Hulu / Disney+ to Disney+", () => {
    expect(suggestedWatchPlatforms("Hulu")).toEqual(["disney_plus", "other"]);
    expect(suggestedWatchPlatforms("Disney+")).toEqual([
      "disney_plus",
      "other",
    ]);
    expect(defaultWatchPlatform("Hulu")).toBe("disney_plus");
    expect(needsWatchPlatformChoice("Disney+")).toBe(false);
  });

  it("maps Max / HBO to Max", () => {
    expect(suggestedWatchPlatforms("Max")).toEqual(["max", "other"]);
    expect(suggestedWatchPlatforms("HBO")).toEqual(["max", "other"]);
    expect(needsWatchPlatformChoice("Max")).toBe(false);
  });

  it("keeps the full list for broadcast networks (FOX may be Max or live)", () => {
    const fox = suggestedWatchPlatforms("FOX");
    expect(fox).toContain("max");
    expect(fox).toContain("youtube_tv");
    expect(defaultWatchPlatform("FOX")).toBeNull();
    expect(needsWatchPlatformChoice("FOX")).toBe(true);
  });

  it("falls back to the full list when the network is unknown", () => {
    const all = suggestedWatchPlatforms("Some Indie Channel");
    expect(all).toContain("netflix");
    expect(all).toContain("max");
    expect(all.length).toBeGreaterThan(5);
    expect(needsWatchPlatformChoice("Some Indie Channel")).toBe(true);
  });
});

describe("resolveStreamWatchSchedule", () => {
  it("shifts Food Network Max drops to next-day 1:00 AM", () => {
    expect(
      resolveStreamWatchSchedule({
        platform: "max",
        network: "Food Network",
        listedDays: ["Monday"],
        listedTime: "18:00",
      }),
    ).toEqual({ days: ["Tuesday"], time: "01:00" });
  });

  it("keeps live / cable listing times", () => {
    expect(
      resolveStreamWatchSchedule({
        platform: "youtube_tv",
        network: "Food Network",
        listedDays: ["Monday"],
        listedTime: "18:00",
      }),
    ).toEqual({ days: ["Monday"], time: "18:00" });
  });

  it("keeps Max original listing times", () => {
    expect(
      resolveStreamWatchSchedule({
        platform: "max",
        network: "Max",
        listedDays: ["Sunday"],
        listedTime: "21:00",
      }),
    ).toEqual({ days: ["Sunday"], time: "21:00" });
  });
});
