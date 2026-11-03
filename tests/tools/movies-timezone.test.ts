import { describe, expect, it } from "vitest";
import {
  calendarDayThisWeek,
  calendarDaysForShow,
  detectCurrentlyAiring,
  formatWatchingAirLine,
} from "../../modules/movies/lib/airing";
import {
  convertWallClockTime,
  formatTime12h,
  formatUsListingLabel,
  HOUSEHOLD_TIMEZONE,
  mountainFromAirstamp,
  normalizeTimeHHMM,
  US_EASTERN_TIMEZONE,
} from "../../modules/movies/lib/timezone";
import {
  mapTvMazeShow,
  resolveMountainSchedule,
  titleMatchesQuery,
} from "../../modules/movies/lib/tvmaze";

describe("movies timezone helpers", () => {
  it("normalizes and formats times", () => {
    expect(normalizeTimeHHMM("21:00")).toBe("21:00");
    expect(normalizeTimeHHMM("9:05:00")).toBe("09:05");
    expect(formatTime12h("21:00")).toBe("9:00 PM");
    expect(formatTime12h("09:05")).toBe("9:05 AM");
  });

  it("converts Eastern prime time to Mountain", () => {
    const mt = convertWallClockTime(
      "21:00",
      "America/New_York",
      HOUSEHOLD_TIMEZONE,
    );
    expect(mt).toBe("19:00");
  });

  it("maps FOX 8/7c (20:00 ET) to 6:00 PM Mountain", () => {
    expect(
      convertWallClockTime("20:00", US_EASTERN_TIMEZONE, HOUSEHOLD_TIMEZONE),
    ).toBe("18:00");
    expect(formatUsListingLabel("20:00", US_EASTERN_TIMEZONE)).toBe("8/7c");
  });

  it("keeps Mountain times unchanged", () => {
    expect(
      convertWallClockTime("20:00", HOUSEHOLD_TIMEZONE, HOUSEHOLD_TIMEZONE),
    ).toBe("20:00");
  });

  it("derives Mountain day/time from TVMaze airstamp", () => {
    // MasterChef finale: Wed Sep 16 2026 8pm EDT = 2026-09-17T00:00:00Z
    const local = mountainFromAirstamp("2026-09-17T00:00:00+00:00");
    expect(local).toEqual({ day: "Wednesday", time: "18:00" });
  });
});

describe("title matching", () => {
  it("matches host-prefixed titles to a short query", () => {
    expect(titleMatchesQuery("Bobby Flay's The Line", "The Line")).toBe(true);
    expect(titleMatchesQuery("Bobby Flay's The Line", "bobby flay the line")).toBe(
      true,
    );
    expect(titleMatchesQuery("The Line", "The Line")).toBe(true);
    expect(titleMatchesQuery("The Shadow Line", "The Line")).toBe(false);
  });
});

describe("airing detection", () => {
  it("treats no next episode as not airing (between seasons)", () => {
    const result = detectCurrentlyAiring({
      status: "Running",
      nextEpisode: null,
    });
    expect(result.currentlyAiring).toBe(false);
    expect(result.reason).toBe("no_next_episode");
  });

  it("treats ended shows as not airing", () => {
    expect(
      detectCurrentlyAiring({ status: "Ended", nextEpisode: null })
        .currentlyAiring,
    ).toBe(false);
  });

  it("treats a next episode as airing", () => {
    const result = detectCurrentlyAiring({
      status: "Running",
      nextEpisode: { airstamp: "2026-11-05T01:00:00+00:00", airdate: "2026-11-04" },
    });
    expect(result.currentlyAiring).toBe(true);
  });
});

describe("calendarDayThisWeek", () => {
  // Sunday Nov 1, 2026 midday MT → week Mon Oct 26 – Sun Nov 1
  const sundayThisWeek = new Date("2026-11-01T19:00:00Z");

  it("places a show only when next_air_at is in the current MT week", () => {
    // Friday Oct 30 10:00 AM MT
    expect(
      calendarDayThisWeek("2026-10-30T16:00:00Z", sundayThisWeek),
    ).toBe("Friday");
  });

  it("does not place a Friday show when the next episode is next Friday", () => {
    // Friday Nov 6 10:00 AM MT — typical night, wrong week
    expect(
      calendarDayThisWeek("2026-11-06T17:00:00Z", sundayThisWeek),
    ).toBeNull();
  });

  it("returns null without a next air stamp", () => {
    expect(calendarDayThisWeek(null, sundayThisWeek)).toBeNull();
  });
});

describe("formatWatchingAirLine", () => {
  // Monday Nov 2, 2026 afternoon MT
  const monday = new Date("2026-11-02T19:00:00Z");

  it("labels a later episode with the concrete next date", () => {
    // Tue Nov 17 6:00 PM MST
    const line = formatWatchingAirLine({
      nextAirAt: "2026-11-18T01:00:00+00:00",
      airDays: ["Tuesday"],
      airTimeLocal: "18:00",
      timezoneLabel: "MST",
      now: monday,
    });
    expect(line).toMatch(/^Next Tue Nov 17 · 6:00 PM MST$/);
  });

  it("labels an episode in the current week as This …", () => {
    // Tue Nov 3 6:00 PM MST
    const line = formatWatchingAirLine({
      nextAirAt: "2026-11-04T01:00:00+00:00",
      airDays: ["Tuesday"],
      airTimeLocal: "18:00",
      timezoneLabel: "MST",
      now: monday,
    });
    expect(line).toMatch(/^This Tue Nov 3 · 6:00 PM MST$/);
  });

  it("falls back to the usual schedule without next_air_at", () => {
    expect(
      formatWatchingAirLine({
        nextAirAt: null,
        airDays: ["Tuesday"],
        airTimeLocal: "18:00",
        timezoneLabel: "MST",
        now: monday,
      }),
    ).toBe("Usually Tue · 6:00 PM MST");
  });

  it("prefers the stream override over the network listing", () => {
    expect(
      formatWatchingAirLine({
        nextAirAt: "2026-11-03T01:00:00+00:00",
        airDays: ["Monday"],
        airTimeLocal: "01:00",
        watchPlatformLabel: "Max",
        scheduleLocked: true,
        listedAirDays: ["Monday"],
        listedAirTimeLocal: "18:00",
        timezoneLabel: "MST",
        now: monday,
      }),
    ).toBe("Max · Mon · 1:00 AM MST (lists Mon · 6:00 PM MST)");
  });
});

describe("calendarDaysForShow", () => {
  const sundayThisWeek = new Date("2026-11-01T19:00:00Z");

  it("uses stream override nights when locked and listed episode is this week", () => {
    expect(
      calendarDaysForShow(
        {
          currently_airing: true,
          next_air_at: "2026-10-30T16:00:00Z",
          schedule_locked: true,
          air_days: ["Saturday"],
        },
        sundayThisWeek,
      ),
    ).toEqual(["Saturday"]);
  });

  it("falls back to listed next-air day when not locked", () => {
    expect(
      calendarDaysForShow(
        {
          currently_airing: true,
          next_air_at: "2026-10-30T16:00:00Z",
          schedule_locked: false,
          air_days: ["Saturday"],
        },
        sundayThisWeek,
      ),
    ).toEqual(["Friday"]);
  });
});

describe("MasterChef schedule resolution", () => {
  it("auto-sets Wednesday 6pm MT from FOX listing but marks between-seasons", () => {
    const hit = mapTvMazeShow({
      id: 324,
      name: "MasterChef",
      language: "English",
      status: "Running",
      schedule: { time: "20:00", days: ["Wednesday"] },
      network: {
        name: "FOX",
        country: { code: "US", timezone: "America/New_York" },
      },
      // No nextepisode embed → not currently airing
    });

    expect(hit.mountain).toMatchObject({
      days: ["Wednesday"],
      time: "18:00",
    });
    expect(hit.source.listingLabel).toBe("8/7c");
    expect(hit.mountain.label).toContain("6:00 PM");
    expect(hit.scheduleSource).toBe("show_schedule");
    expect(hit.currentlyAiring).toBe(false);
    expect(hit.airingLabel).toMatch(/not/i);
  });

  it("marks airing when nextepisode is present", () => {
    const hit = mapTvMazeShow({
      id: 324,
      name: "MasterChef",
      status: "Running",
      schedule: { time: "20:00", days: ["Wednesday"] },
      network: {
        name: "FOX",
        country: { code: "US", timezone: "America/New_York" },
      },
      _embedded: {
        nextepisode: {
          airdate: "2027-05-20",
          airtime: "20:00",
          airstamp: "2027-05-21T00:00:00+00:00",
        },
      },
    });
    expect(hit.currentlyAiring).toBe(true);
  });

  it("falls back to episode airstamp when schedule time is empty", () => {
    const resolved = resolveMountainSchedule(
      {
        id: 1,
        name: "Example",
        schedule: { time: "", days: [] },
        network: {
          name: "FOX",
          country: { code: "US", timezone: "America/New_York" },
        },
        _embedded: {
          previousepisode: {
            airtime: "20:00",
            airstamp: "2026-09-17T00:00:00+00:00",
          },
        },
      },
      [],
    );

    expect(resolved.mountain.days).toEqual(["Wednesday"]);
    expect(resolved.mountain.time).toBe("18:00");
    expect(resolved.scheduleSource).toBe("airstamp");
  });
});
