import { notFound, redirect } from "next/navigation";
import { ToolsChrome } from "@/components/tools/tools-chrome";
import { AuthError, requireHouseholdContext } from "@meals/lib/auth/session";
import { ProjectDetailApp } from "@projects/components/project-detail";
import { listCommentsForProjectTree } from "@projects/lib/comments";
import { getProjectDetail } from "@projects/lib/projects";
import { requireToolsUser } from "@/lib/tools/auth/session";

export const metadata = {
  title: "Project — House Projects",
  robots: { index: false, follow: false },
};

export default async function HouseProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireToolsUser();
  const { projectId } = await params;

  let householdId: string;
  let email: string;
  try {
    const ctx = await requireHouseholdContext();
    householdId = ctx.householdId;
    email = ctx.user.email;
  } catch (e) {
    if (e instanceof AuthError && e.code === "unauthenticated") {
      redirect(`/tools/login?next=/tools/projects/${projectId}`);
    }
    throw e;
  }

  const project = await getProjectDetail(householdId, projectId);
  if (!project) notFound();

  const subIds = project.sub_projects.map((s) => s.id);
  const lineIds = project.sub_projects.flatMap((s) =>
    s.line_items.map((li) => li.id),
  );
  const comments = await listCommentsForProjectTree(
    householdId,
    project.id,
    subIds,
    lineIds,
  );

  return (
    <ToolsChrome
      email={email}
      activeHref="/tools/projects"
      crumbs={[{ label: project.title }]}
    >
      <ProjectDetailApp
        initialProject={project}
        initialComments={comments}
      />
    </ToolsChrome>
  );
}
