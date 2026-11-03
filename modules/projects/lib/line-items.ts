import { query, queryOne } from "@meals/lib/db";
import { mapLineItem } from "@projects/lib/projects";
import { getSubProject } from "@projects/lib/sub-projects";
import type {
  Assignee,
  HouseLineItem,
  WorkStatus,
} from "@projects/types";

export async function getLineItem(
  householdId: string,
  lineItemId: string,
): Promise<HouseLineItem | null> {
  const row = await queryOne<Record<string, unknown>>`
    SELECT li.*
    FROM house_line_items li
    JOIN house_sub_projects sp ON sp.id = li.sub_project_id
    JOIN house_projects p ON p.id = sp.project_id
    WHERE li.id = ${lineItemId} AND p.household_id = ${householdId}
    LIMIT 1
  `;
  return row ? mapLineItem(row) : null;
}

export async function insertLineItem(input: {
  householdId: string;
  subProjectId: string;
  title: string;
  description?: string | null;
  estimateCents?: number | null;
  actualCents?: number | null;
  assignee?: Assignee | null;
}): Promise<HouseLineItem> {
  const sub = await getSubProject(input.householdId, input.subProjectId);
  if (!sub) throw new Error("Sub-project not found");

  const max = await queryOne<{ max_sort: number | null }>`
    SELECT MAX(sort_order) AS max_sort
    FROM house_line_items
    WHERE sub_project_id = ${input.subProjectId}
  `;
  const sortOrder = (max?.max_sort ?? -1) + 1;

  const row = await queryOne<Record<string, unknown>>`
    INSERT INTO house_line_items (
      sub_project_id, title, description,
      estimate_cents, actual_cents, assignee, sort_order
    )
    VALUES (
      ${input.subProjectId},
      ${input.title},
      ${input.description ?? null},
      ${input.estimateCents ?? null},
      ${input.actualCents ?? null},
      ${input.assignee ?? null},
      ${sortOrder}
    )
    RETURNING *
  `;
  if (!row) throw new Error("Failed to create line item");
  return mapLineItem(row);
}

export async function updateLineItem(
  householdId: string,
  lineItemId: string,
  patch: {
    title?: string;
    description?: string | null;
    status?: WorkStatus;
    estimate_cents?: number | null;
    actual_cents?: number | null;
    assignee?: Assignee | null;
    sort_order?: number;
  },
): Promise<HouseLineItem | null> {
  const existing = await getLineItem(householdId, lineItemId);
  if (!existing) return null;

  const title = patch.title ?? existing.title;
  const description =
    patch.description !== undefined ? patch.description : existing.description;
  const status = patch.status ?? existing.status;
  const estimate_cents =
    patch.estimate_cents !== undefined
      ? patch.estimate_cents
      : existing.estimate_cents;
  const actual_cents =
    patch.actual_cents !== undefined ? patch.actual_cents : existing.actual_cents;
  const assignee =
    patch.assignee !== undefined ? patch.assignee : existing.assignee;
  const sort_order = patch.sort_order ?? existing.sort_order;

  const row = await queryOne<Record<string, unknown>>`
    UPDATE house_line_items
    SET
      title = ${title},
      description = ${description},
      status = ${status},
      estimate_cents = ${estimate_cents},
      actual_cents = ${actual_cents},
      assignee = ${assignee},
      sort_order = ${sort_order}
    WHERE id = ${lineItemId}
    RETURNING *
  `;
  return row ? mapLineItem(row) : null;
}

export async function deleteLineItem(
  householdId: string,
  lineItemId: string,
): Promise<boolean> {
  const existing = await getLineItem(householdId, lineItemId);
  if (!existing) return false;
  const row = await queryOne<{ id: string }>`
    DELETE FROM house_line_items WHERE id = ${lineItemId} RETURNING id
  `;
  return Boolean(row);
}

export async function reorderLineItem(
  householdId: string,
  lineItemId: string,
  direction: -1 | 1,
): Promise<void> {
  const current = await getLineItem(householdId, lineItemId);
  if (!current) return;

  const siblings = await query<Record<string, unknown>>`
    SELECT id, sort_order
    FROM house_line_items
    WHERE sub_project_id = ${current.sub_project_id}
    ORDER BY sort_order ASC, created_at ASC
  `;
  const index = siblings.findIndex((r) => String(r.id) === lineItemId);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return;

  const a = siblings[index]!;
  const b = siblings[swapIndex]!;
  await query`
    UPDATE house_line_items SET sort_order = ${Number(b.sort_order)}
    WHERE id = ${String(a.id)}
  `;
  await query`
    UPDATE house_line_items SET sort_order = ${Number(a.sort_order)}
    WHERE id = ${String(b.id)}
  `;
}
