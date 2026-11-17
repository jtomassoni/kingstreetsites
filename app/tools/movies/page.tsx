import { redirect } from "next/navigation";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { MoviesShell } from "@movies/components/movies-shell";
import { listWatchingShows } from "@movies/lib/shows";
import {
  HOUSEHOLD_TIMEZONE,
  shortTimezoneLabel,
} from "@movies/lib/timezone";
import { listWishlistItems } from "@movies/lib/wishlist";
import { voterFromEmail } from "@movies/lib/voters";
import { requireToolsUser } from "@/lib/tools/auth/session";

export const metadata = {
  title: "Movies — Tools",
  robots: { index: false, follow: false },
};

export default async function MoviesToolPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
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

  const params = searchParams ? await searchParams : undefined;
  const initialTab = params?.tab === "wishlist" ? "wishlist" : "watching";

  const [shows, wishlist] = await Promise.all([
    listWatchingShows(householdId, ["watching"]),
    listWishlistItems(householdId),
  ]);
  const timezoneLabel = shortTimezoneLabel(HOUSEHOLD_TIMEZONE);

  return (
    <ToolsChrome email={email} activeHref="/tools/movies">
      <MoviesShell
        initialShows={shows}
        initialWishlist={wishlist}
        timezoneLabel={timezoneLabel}
        viewer={voterFromEmail(email)}
        initialTab={initialTab}
      />
    </ToolsChrome>
  );
}
