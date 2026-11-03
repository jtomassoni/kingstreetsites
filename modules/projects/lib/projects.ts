import { query, queryOne } from "@meals/lib/db";
import { rollupFromLineItems } from "@projects/lib/rollups";
import type {
  BoardGroup,
  CostRollup,
  HouseLineItem,
  HouseProject,
  HouseSubProject,
  ProjectDetail,
  ProjectListItem,
  WorkStatus,
} from "@projects/types";

function mapProject(row: Record<string, unknown>): HouseProject {
  return {
    id: String(row.id),
    household_id: String(row.household_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    board_group: row.board_group as BoardGroup,
    priority: Number(row.priority),
    archived: row.archived === true,
    budget_cents:
      row.budget_cents === null || row.budget_cents === undefined
        ? null
        : Number(row.budget_cents),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSubProject(row: Record<string, unknown>): HouseSubProject {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: row.status as WorkStatus,
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapLineItem(row: Record<string, unknown>): HouseLineItem {
  return {
    id: String(row.id),
    sub_project_id: String(row.sub_project_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: row.status as WorkStatus,
    estimate_cents:
      row.estimate_cents === null || row.estimate_cents === undefined
        ? null
        : Number(row.estimate_cents),
    actual_cents:
      row.actual_cents === null || row.actual_cents === undefined
        ? null
        : Number(row.actual_cents),
    assignee: (row.assignee as HouseLineItem["assignee"]) ?? null,
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listProjects(
  householdId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ProjectListItem[]> {
  const includeArchived = opts.includeArchived === true;
  const rows = await query<Record<string, unknown>>`
    SELECT
      p.*,
      COALESCE((
        SELECT COUNT(*)::int FROM house_sub_projects sp WHERE sp.project_id = p.id
      ), 0) AS sub_project_count,
      COALESCE((
        SELECT COUNT(*)::int
        FROM house_line_items li
        JOIN house_sub_projects sp ON sp.id = li.sub_project_id
        WHERE sp.project_id = p.id AND li.status <> 'done'
      ), 0) AS open_item_count,
      COALESCE((
        SELECT SUM(li.estimate_cents)::int
        FROM house_line_items li
        JOIN house_sub_projects sp ON sp.id = li.sub_project_id
        WHERE sp.project_id = p.id AND li.estimate_cents IS NOT NULL
      ), 0) AS estimate_sum,
      COALESCE((
        SELECT SUM(li.actual_cents)::int
        FROM house_line_items li
        JOIN house_sub_projects sp ON sp.id = li.sub_project_id
        WHERE sp.project_id = p.id AND li.actual_cents IS NOT NULL
      ), 0) AS actual_sum
    FROM house_projects p
    WHERE p.household_id = ${householdId}
      AND (${includeArchived} OR p.archived = false)
    ORDER BY
      CASE p.board_group
        WHEN 'backlog' THEN 0
        WHEN 'planned' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'blocked' THEN 3
        WHEN 'done' THEN 4
        ELSE 5
      END,
      p.priority ASC,
      p.created_at ASC
  `;

  return rows.map((row) => {
    const project = mapProject(row);
    const budget = project.budget_cents;
    const estimate = Number(row.estimate_sum) || 0;
    const actual = Number(row.actual_sum) || 0;
    const rollup: CostRollup = {
      estimate_cents: estimate,
      actual_cents: actual,
      budget_cents: budget,
      remaining_cents: budget === null ? null : budget - actual,
    };
    return {
      ...project,
      rollup,
      sub_project_count: Number(row.sub_project_count) || 0,
      open_item_count: Number(row.open_item_count) || 0,
    };
  });
}

export async function getProject(
  householdId: string,
  projectId: string,
): Promise<HouseProject | null> {
  const row = await queryOne<Record<string, unknown>>`
    SELECT * FROM house_projects
    WHERE id = ${projectId} AND household_id = ${householdId}
    LIMIT 1
  `;
  return row ? mapProject(row) : null;
}

export async function getProjectDetail(
  householdId: string,
  projectId: string,
): Promise<ProjectDetail | null> {
  const project = await getProject(householdId, projectId);
  if (!project) return null;

  const subRows = await query<Record<string, unknown>>`
    SELECT * FROM house_sub_projects
    WHERE project_id = ${projectId}
    ORDER BY sort_order ASC, created_at ASC
  `;
  const subs = subRows.map(mapSubProject);
  const subIds = subs.map((s) => s.id);

  let lineItems: HouseLineItem[] = [];
  if (subIds.length) {
    const itemRows = await query<Record<string, unknown>>`
      SELECT li.*
      FROM house_line_items li
      WHERE li.sub_project_id = ANY(${subIds}::uuid[])
      ORDER BY li.sort_order ASC, li.created_at ASC
    `;
    lineItems = itemRows.map(mapLineItem);
  }

  const bySub = new Map<string, HouseLineItem[]>();
  for (const item of lineItems) {
    const list = bySub.get(item.sub_project_id) ?? [];
    list.push(item);
    bySub.set(item.sub_project_id, list);
  }

  const sub_projects = subs.map((sp) => {
    const items = bySub.get(sp.id) ?? [];
    return {
      ...sp,
      line_items: items,
      rollup: rollupFromLineItems(items),
    };
  });

  return {
    ...project,
    rollup: rollupFromLineItems(lineItems, project.budget_cents),
    sub_projects,
  };
}

export async function nextPriorityInGroup(
  householdId: string,
  boardGroup: BoardGroup,
): Promise<number> {
  const row = await queryOne<{ max_priority: number | null }>`
    SELECT MAX(priority) AS max_priority
    FROM house_projects
    WHERE household_id = ${householdId}
      AND board_group = ${boardGroup}
      AND archived = false
  `;
  return (row?.max_priority ?? -1) + 1;
}

export async function insertProject(input: {
  householdId: string;
  title: string;
  description?: string | null;
  boardGroup?: BoardGroup;
  budgetCents?: number | null;
  createdBy?: string | null;
}): Promise<HouseProject> {
  const boardGroup = input.boardGroup ?? "backlog";
  const priority = await nextPriorityInGroup(input.householdId, boardGroup);
  const row = await queryOne<Record<string, unknown>>`
    INSERT INTO house_projects (
      household_id, title, description, board_group, priority,
      budget_cents, created_by
    )
    VALUES (
      ${input.householdId},
      ${input.title},
      ${input.description ?? null},
      ${boardGroup},
      ${priority},
      ${input.budgetCents ?? null},
      ${input.createdBy ?? null}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Failed to create project");
  return mapProject(row);
}

export async function updateProject(
  householdId: string,
  projectId: string,
  patch: {
    title?: string;
    description?: string | null;
    board_group?: BoardGroup;
    priority?: number;
    archived?: boolean;
    budget_cents?: number | null;
  },
): Promise<HouseProject | null> {
  const existing = await getProject(householdId, projectId);
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const description =
    patch.description !== undefined ? patch.description : existing.description;
  const board_group = patch.board_group ?? existing.board_group;
  const priority = patch.priority ?? existing.priority;
  const archived = patch.archived ?? existing.archived;
  const budget_cents =
    patch.budget_cents !== undefined ? patch.budget_cents : existing.budget_cents;

  const row = await queryOne<Record<string, unknown>>`
    UPDATE house_projects
    SET
      title = ${title},
      description = ${description},
      board_group = ${board_group},
      priority = ${priority},
      archived = ${archived},
      budget_cents = ${budget_cents}
    WHERE id = ${projectId} AND household_id = ${householdId}
    RETURNING *
  `;
  return row ? mapProject(row) : null;
}

export async function deleteProject(
  householdId: string,
  projectId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>`
    DELETE FROM house_projects
    WHERE id = ${projectId} AND household_id = ${householdId}
    RETURNING id
  `;
  return Boolean(row);
}

/** Swap priority with neighbor in the same board group (direction -1 = up). */
export async function reorderProjectInGroup(
  householdId: string,
  projectId: string,
  direction: -1 | 1,
): Promise<void> {
  const project = await getProject(householdId, projectId);
  if (!project || project.archived) return;

  const siblings = await query<Record<string, unknown>>`
    SELECT id, priority
    FROM house_projects
    WHERE household_id = ${householdId}
      AND board_group = ${project.board_group}
      AND archived = false
    ORDER BY priority ASC, created_at ASC
  `;

  const index = siblings.findIndex((r) => String(r.id) === projectId);
  if (index < 0) return;
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;

  const a = siblings[index]!;
  const b = siblings[swapIndex]!;
  const aPriority = Number(a.priority);
  const bPriority = Number(b.priority);

  await query`
    UPDATE house_projects SET priority = ${bPriority}
    WHERE id = ${String(a.id)} AND household_id = ${householdId}
  `;
  await query`
    UPDATE house_projects SET priority = ${aPriority}
    WHERE id = ${String(b.id)} AND household_id = ${householdId}
  `;
}

export async function moveProjectToGroup(
  householdId: string,
  projectId: string,
  boardGroup: BoardGroup,
): Promise<HouseProject | null> {
  const project = await getProject(householdId, projectId);
  if (!project) return null;
  if (project.board_group === boardGroup) return project;

  const priority = await nextPriorityInGroup(householdId, boardGroup);
  return updateProject(householdId, projectId, {
    board_group: boardGroup,
    priority,
  });
}

export { mapSubProject, mapLineItem };
