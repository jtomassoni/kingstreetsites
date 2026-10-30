import { ToolsChrome } from "@/components/tools/tools-chrome";
import { Shell } from "@arcade/components/Shell";
import { requireToolsUser } from "@/lib/tools/auth/session";
import "@arcade/arcade.css";

export const metadata = {
  title: "Shoot ’Em Up — Tools",
  robots: { index: false, follow: false },
};

export default async function ArcadeToolPage() {
  const user = await requireToolsUser();

  return (
    <ToolsChrome email={user.email} activeHref="/tools/arcade" distractFree>
      <Shell />
    </ToolsChrome>
  );
}
