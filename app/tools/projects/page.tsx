import { redirect } from "next/navigation";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { ProjectsBoard } from "@projects/components/projects-board";
import { listProjects } from "@projects/lib/projects";
import { requireToolsUser } from "@/lib/tools/auth/session";

export const metadata = {
  title: "House Projects — Tools",
  robots: { index: false, follow: false },
};

export default async function HouseProjectsToolPage() {
  await requireToolsUser();

  let householdId: string;
  let email: string;
  try {
    const ctx = await requireHouseholdContext();
    householdId = ctx.householdId;
    email = ctx.user.email;
  } catch (e) {
    if (e instanceof AuthError && e.code === "unauthenticated") {
      redirect("/tools/login?next=/tools/projects");
    }
    throw e;
  }

  const projects = await listProjects(householdId, { includeArchived: false });

  return (
    <ToolsChrome email={email} activeHref="/tools/projects">
      <ProjectsBoard initialProjects={projects} />
    </ToolsChrome>
  );
}
