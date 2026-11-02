import { redirect } from "next/navigation";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { WatchingApp } from "@movies/components/watching-app";
import { listWatchingShows } from "@movies/lib/shows";
import {
  HOUSEHOLD_TIMEZONE,
  shortTimezoneLabel,
} from "@movies/lib/timezone";
import { requireToolsUser } from "@/lib/tools/auth/session";

export const metadata = {
  title: "Watching — Tools",
  robots: { index: false, follow: false },
};

export default async function MoviesToolPage() {
  await requireToolsUser();

  let householdId: string;
  let email: string;
  try {
    const ctx = await requireHouseholdContext();
    householdId = ctx.householdId;
    email = ctx.user.email;
  } catch (e) {
    if (e instanceof AuthError && e.code === "unauthenticated") {
      redirect("/tools/login?next=/tools/movies");
    }
    throw e;
  }

  const shows = await listWatchingShows(householdId, ["watching"]);
  const timezoneLabel = shortTimezoneLabel(HOUSEHOLD_TIMEZONE);

  return (
    <ToolsChrome email={email} activeHref="/tools/movies">
      <WatchingApp initialShows={shows} timezoneLabel={timezoneLabel} />
    </ToolsChrome>
  );
}
