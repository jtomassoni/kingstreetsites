import { query, queryOne } from "@meals/lib/db";
import { getProject, mapSubProject } from "@projects/lib/projects";
import type { HouseSubProject, WorkStatus } from "@projects/types";

async function assertProject(
  householdId: string,
  projectId: string,
): Promise<boolean> {
  return Boolean(await getProject(householdId, projectId));
}

export async function getSubProject(
  householdId: string,
  subProjectId: string,
): Promise<HouseSubProject | null> {
  const row = await queryOne<Record<string, unknown>>`
    SELECT sp.*
    FROM house_sub_projects sp
    JOIN house_projects p ON p.id = sp.project_id
    WHERE sp.id = ${subProjectId} AND p.household_id = ${householdId}
    LIMIT 1
  `;
  return row ? mapSubProject(row) : null;
}

export async function insertSubProject(input: {
  householdId: string;
  projectId: string;
  title: string;
  description?: string | null;
}): Promise<HouseSubProject> {
  if (!(await assertProject(input.householdId, input.projectId))) {
    throw new Error("Project not found");
  }
  const max = await queryOne<{ max_sort: number | null }>`
    SELECT MAX(sort_order) AS max_sort
    FROM house_sub_projects
    WHERE project_id = ${input.projectId}
  `;
  const sortOrder = (max?.max_sort ?? -1) + 1;
  const row = await queryOne<Record<string, unknown>>`
    INSERT INTO house_sub_projects (project_id, title, description, sort_order)
    VALUES (
      ${input.projectId},
      ${input.title},
      ${input.description ?? null},
      ${sortOrder}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Failed to create sub-project");
  return mapSubProject(row);
}

export async function updateSubProject(
  householdId: string,
  subProjectId: string,
  patch: {
    title?: string;
    description?: string | null;
    status?: WorkStatus;
    sort_order?: number;
  },
): Promise<HouseSubProject | null> {
  const existing = await getSubProject(householdId, subProjectId);
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const description =
    patch.description !== undefined ? patch.description : existing.description;
  const status = patch.status ?? existing.status;
  const sort_order = patch.sort_order ?? existing.sort_order;

  const row = await queryOne<Record<string, unknown>>`
    UPDATE house_sub_projects
    SET
      title = ${title},
      description = ${description},
      status = ${status},
      sort_order = ${sort_order}
    WHERE id = ${subProjectId}
    RETURNING *
  `;
  return row ? mapSubProject(row) : null;
}

export async function deleteSubProject(
  householdId: string,
  subProjectId: string,
): Promise<boolean> {
  const existing = await getSubProject(householdId, subProjectId);
  if (!existing) return false;
  const row = await queryOne<{ id: string }>`
    DELETE FROM house_sub_projects WHERE id = ${subProjectId} RETURNING id
  `;
  return Boolean(row);
}

export async function reorderSubProject(
  householdId: string,
  subProjectId: string,
  direction: -1 | 1,
): Promise<void> {
  const current = await getSubProject(householdId, subProjectId);
  if (!current) return;

  const siblings = await query<Record<string, unknown>>`
    SELECT id, sort_order
    FROM house_sub_projects
    WHERE project_id = ${current.project_id}
    ORDER BY sort_order ASC, created_at ASC
  `;
  const index = siblings.findIndex((r) => String(r.id) === subProjectId);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return;

  const a = siblings[index]!;
  const b = siblings[swapIndex]!;
  await query`
    UPDATE house_sub_projects SET sort_order = ${Number(b.sort_order)}
    WHERE id = ${String(a.id)}
  `;
  await query`
    UPDATE house_sub_projects SET sort_order = ${Number(a.sort_order)}
    WHERE id = ${String(b.id)}
  `;
}
