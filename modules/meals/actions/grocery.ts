"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { getSql, query, queryOne } from "@meals/lib/db";
import {
  consolidateGroceryItems,
  type GroceryCandidate,
  type GroceryMealSource,
} from "@meals/lib/grocery/consolidate";
import { evaluateCostcoCandidate } from "@meals/lib/grocery/costco";
import {
  applyStorePackaging,
  packGroceryItemForStore,
} from "@meals/lib/grocery/packaging";
import { scaleIngredient } from "@meals/lib/grocery/scaling";
import { isExcludedFromGeneratedGrocery } from "@meals/lib/grocery/exclude";
import {
  inferGrocerySection,
  normalizeGrocerySection,
  resolveGrocerySection,
} from "@meals/lib/grocery/sections";
import { cookYieldServings } from "@meals/lib/meals/appetite";

const WORKDAY_SNACK_DEFAULTS: GroceryCandidate[] = [
  {
    name: "Hummus",
    quantity: 1,
    unit: "tub",
    section: "dairy",
    preferredStore: "any",
    costcoBulkCandidate: false,
    sourceNote: "Workday snack prep",
  },
  {
    name: "Carrots",
    quantity: 1,
    unit: "bag",
    section: "produce",
    preferredStore: "any",
    costcoBulkCandidate: false,
    sourceNote: "Workday snack prep",
  },
  {
    name: "Fruit",
    quantity: 1,
    unit: "bag",
    section: "produce",
    preferredStore: "any",
    costcoBulkCandidate: false,
    sourceNote: "Workday snack prep",
  },
  {
    name: "Protein Snacks",
    quantity: 1,
    unit: "pack",
    section: "snacks",
    preferredStore: "any",
    costcoBulkCandidate: true,
    sourceNote: "Workday snack prep",
  },
];

/**
 * Rebuild the grocery list from the current week menu.
 * Manual items are kept; generated rows (including prior edits) are replaced.
 * Quiet by default for background regenerations.
 */
export async function syncGroceryForPlan(weeklyPlanId: string) {
  return generateGroceryList(weeklyPlanId, {
    overwriteEdited: true,
    quiet: true,
  });
}

/** Remember which meals produced each generated line so the list can open that recipe. */
async function insertGroceryItemSources(
  householdId: string,
  listId: string,
  items: GroceryCandidate[],
) {
  const inserted = await query<{ id: string; name: string }>`
    SELECT id, name FROM grocery_items
    WHERE grocery_list_id = ${listId}
      AND household_id = ${householdId}
      AND is_manual = false
  `;
  const itemIdByName = new Map(inserted.map((row) => [row.name, row.id]));
  const rows: {
    grocery_item_id: string;
    planned_meal_id: string;
    recipe_ingredient_id: string;
    note: string;
  }[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const groceryItemId = itemIdByName.get(item.name);
    if (!groceryItemId) continue;
    for (const source of item.sources ?? []) {
      if (!source.recipeId) continue;
      const key = `${groceryItemId}:${source.plannedMealId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        grocery_item_id: groceryItemId,
        planned_meal_id: source.plannedMealId,
        recipe_ingredient_id: source.recipeIngredientId ?? "",
        note: source.mealTitle,
      });
    }
  }

  if (!rows.length) return;

  await query`
    INSERT INTO grocery_item_sources (
      grocery_item_id, household_id, planned_meal_id, recipe_ingredient_id, note
    )
    SELECT
      x.grocery_item_id::uuid,
      ${householdId}::uuid,
      x.planned_meal_id::uuid,
      NULLIF(x.recipe_ingredient_id, '')::uuid,
      NULLIF(x.note, '')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
      grocery_item_id text,
      planned_meal_id text,
      recipe_ingredient_id text,
      note text
    )
  `;
}

/** Rebuild grocery after the response so meal edits stay interactive. */
export async function queueGrocerySync(weeklyPlanId: string) {
  after(async () => {
    try {
      await generateGroceryList(weeklyPlanId, {
        overwriteEdited: true,
        quiet: true,
      });
    } catch (err) {
      console.error("Background grocery sync failed", err);
    }
  });
}

export async function generateGroceryList(
  weeklyPlanId: string,
  options?: { overwriteEdited?: boolean; quiet?: boolean },
) {
  const { user, householdId } = await requireHouseholdContext();

  const plan = await queryOne<{ id: string }>`
    SELECT * FROM weekly_plans
    WHERE id = ${weeklyPlanId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!plan) return { error: "Plan not found" };

  const meals = await query<{
    id: string;
    recipe_version_id: string | null;
    recipe_id: string | null;
    meal_type: string;
    notes: string | null;
    title: string;
    servings: number | null;
    assigned_to: string;
  }>`
    SELECT * FROM planned_meals WHERE weekly_plan_id = ${weeklyPlanId}
  `;

  const planDays = await query<{
    needs_portable_snacks: boolean;
    profile_type: string;
  }>`
    SELECT * FROM plan_days WHERE weekly_plan_id = ${weeklyPlanId}
  `;

  const candidates: GroceryCandidate[] = [];
  const mealUseCounts = new Map<string, number>();

  const recipeIds = [
    ...new Set(
      meals
        .map((meal) => meal.recipe_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const currentVersions = recipeIds.length
    ? await query<{
        recipe_id: string;
        id: string;
        default_servings: number | null;
      }>`
        SELECT recipe_id, id, default_servings
        FROM recipe_versions
        WHERE is_current = true AND recipe_id = ANY(${recipeIds}::uuid[])
      `
    : [];
  const currentByRecipeId = new Map(
    currentVersions.map((version) => [version.recipe_id, version]),
  );

  const versionIdByMeal = new Map<string, string>();
  for (const meal of meals) {
    const current = meal.recipe_id
      ? currentByRecipeId.get(meal.recipe_id)
      : undefined;
    const versionId = current?.id ?? meal.recipe_version_id ?? null;
    if (versionId) versionIdByMeal.set(meal.id, versionId);
  }

  const uniqueVersionIds = [...new Set(versionIdByMeal.values())];
  const knownVersionIds = new Set(currentVersions.map((version) => version.id));
  const extraVersionIds = uniqueVersionIds.filter(
    (id) => !knownVersionIds.has(id),
  );
  const extraVersions = extraVersionIds.length
    ? await query<{
        id: string;
        recipe_id: string;
        default_servings: number | null;
      }>`
        SELECT id, recipe_id, default_servings
        FROM recipe_versions
        WHERE id = ANY(${extraVersionIds}::uuid[])
      `
    : [];

  const servingsByVersion = new Map<string, number | null>();
  const recipeIdByVersion = new Map<string, string>();
  for (const version of currentVersions) {
    servingsByVersion.set(version.id, version.default_servings);
    recipeIdByVersion.set(version.id, version.recipe_id);
  }
  for (const version of extraVersions) {
    servingsByVersion.set(version.id, version.default_servings);
    recipeIdByVersion.set(version.id, version.recipe_id);
  }

  const ingredientRows = uniqueVersionIds.length
    ? await query<{
        recipe_version_id: string;
        id: string;
        optional: boolean;
        ingredient_name: string;
        quantity: number | null;
        unit: string | null;
        grocery_category: string | null;
        preferred_store: string | null;
        costco_bulk_candidate: boolean;
      }>`
        SELECT recipe_version_id, id, optional, ingredient_name, quantity, unit,
               grocery_category, preferred_store, costco_bulk_candidate
        FROM recipe_ingredients
        WHERE recipe_version_id = ANY(${uniqueVersionIds}::uuid[])
        ORDER BY sort_order
      `
    : [];
  const ingredientsByVersion = new Map<string, typeof ingredientRows>();
  for (const ingredient of ingredientRows) {
    const list = ingredientsByVersion.get(ingredient.recipe_version_id) ?? [];
    list.push(ingredient);
    ingredientsByVersion.set(ingredient.recipe_version_id, list);
  }

  for (const meal of meals) {
    const assignedTo = meal.assigned_to === "both" ? "both" : "specific";
    const mealYield = cookYieldServings(meal.servings, assignedTo);

    if (!meal.recipe_version_id && !meal.recipe_id) {
      if (meal.meal_type === "snack_prep" || meal.notes) {
        candidates.push({
          name: meal.title,
          quantity: mealYield,
          unit: "item",
          section: inferGrocerySection(meal.title),
          preferredStore: "any",
          costcoBulkCandidate: false,
          sourceNote: `From ${meal.title}`,
          plannedMealId: meal.id,
        });
      }
      continue;
    }

    const versionId = versionIdByMeal.get(meal.id);
    if (!versionId) continue;

    const ingredients = ingredientsByVersion.get(versionId) ?? [];
    const fromServings = servingsByVersion.get(versionId) ?? 1;
    const toServings = mealYield;
    const recipeId = meal.recipe_id ?? recipeIdByVersion.get(versionId);

    for (const ing of ingredients) {
      if (ing.optional) continue;
      const key = ing.ingredient_name.trim().toLowerCase();
      mealUseCounts.set(key, (mealUseCounts.get(key) ?? 0) + 1);

      const source: GroceryMealSource | null =
        recipeId
          ? {
              plannedMealId: meal.id,
              recipeId,
              recipeIngredientId: ing.id,
              mealTitle: meal.title,
            }
          : null;

      candidates.push({
        name: ing.ingredient_name,
        quantity: scaleIngredient(ing.quantity, fromServings, toServings),
        unit: ing.unit ?? "item",
        section: resolveGrocerySection(
          ing.grocery_category,
          ing.ingredient_name,
        ),
        preferredStore: (ing.preferred_store as GroceryCandidate["preferredStore"]) ?? "any",
        costcoBulkCandidate: ing.costco_bulk_candidate,
        sourceNote: meal.title,
        plannedMealId: meal.id,
        recipeIngredientId: ing.id,
        sources: source ? [source] : [],
      });
    }
  }

  for (const day of planDays) {
    if (day.needs_portable_snacks || day.profile_type === "workday") {
      for (const snack of WORKDAY_SNACK_DEFAULTS) {
        candidates.push({ ...snack });
      }
    }
  }

  const shoppable = candidates.filter(
    (c) => !isExcludedFromGeneratedGrocery(c.name),
  );

  const consolidated = consolidateGroceryItems(shoppable).map((item) => {
    const key = item.name.trim().toLowerCase();
    const mealCount = mealUseCounts.get(key) ?? 1;
    const evalResult = evaluateCostcoCandidate({
      ingredientName: item.name,
      normalizedName: key,
      mealCount,
      totalQuantity: item.quantity ?? 0,
      unit: item.unit,
      manualPreference: item.costcoBulkCandidate,
    });
    const packed = applyStorePackaging({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      store: evalResult.isCandidate ? "costco" : "grocery",
    });
    return {
      ...item,
      quantity: packed.quantity,
      unit: packed.unit,
      costcoBulkCandidate: evalResult.isCandidate,
      pantryStatus: "needed" as const,
      costcoReasons: evalResult.reasons,
      surplusNote: packed.surplusNote,
    };
  });

  const existingList = await queryOne<{ id: string }>`
    SELECT * FROM grocery_lists
    WHERE weekly_plan_id = ${weeklyPlanId}
      AND household_id = ${householdId}
      AND status = 'active'
    LIMIT 1
  `;

  let listId = existingList?.id;

  if (existingList) {
    const existingItems = await query<{
      is_manual: boolean;
      is_user_edited: boolean;
    }>`
      SELECT * FROM grocery_items WHERE grocery_list_id = ${existingList.id}
    `;

    const manual = existingItems.filter((i) => i.is_manual);
    const edited = existingItems.filter(
      (i) => i.is_user_edited && !i.is_manual,
    );

    if (edited.length && !options?.overwriteEdited) {
      return {
        error: "edited_items",
        message:
          "Some generated items were edited. Confirm overwrite or keep edits.",
        listId: existingList.id,
        editedCount: edited.length,
      };
    }

    await query`
      DELETE FROM grocery_items
      WHERE grocery_list_id = ${existingList.id} AND is_manual = false
    `;

    listId = existingList.id;
    void manual;
  } else {
    const list = await queryOne<{ id: string }>`
      INSERT INTO grocery_lists (
        household_id, weekly_plan_id, status, generated_at, generated_by
      ) VALUES (
        ${householdId},
        ${weeklyPlanId},
        'active',
        ${new Date().toISOString()},
        ${user.id}
      )
      RETURNING id
    `;
    if (!list) return { error: "List create failed" };
    listId = list.id;
  }

  await query`
    UPDATE grocery_lists SET
      generated_at = ${new Date().toISOString()},
      generated_by = ${user.id}
    WHERE id = ${listId!}
  `;

  if (consolidated.length) {
    const rows = consolidated.map((item, index) => {
      const store = (
        ["king_soopers", "whole_foods", "costco", "any"] as const
      ).includes(
        item.preferredStore as "king_soopers" | "whole_foods" | "costco" | "any",
      )
        ? (item.preferredStore as
            | "king_soopers"
            | "whole_foods"
            | "costco"
            | "any")
        : ("any" as const);
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        section: item.section,
        preferred_store: store,
        costco_bulk_candidate: item.costcoBulkCandidate,
        pantry_status: item.pantryStatus,
        notes: item.surplusNote
          ? item.surplusNote
          : item.costcoReasons?.length
            ? `Costco suggestion: ${item.costcoReasons.join("; ")}`
            : item.sourceNote,
        sort_order: index,
      };
    });

    try {
      await query`
        INSERT INTO grocery_items (
          grocery_list_id, household_id, name, quantity, unit, section,
          preferred_store, costco_bulk_candidate, pantry_status, is_checked,
          notes, is_manual, is_user_edited, sort_order
        )
        SELECT
          ${listId!}::uuid,
          ${householdId}::uuid,
          x.name,
          x.quantity,
          x.unit,
          x.section,
          x.preferred_store,
          x.costco_bulk_candidate,
          x.pantry_status,
          false,
          x.notes,
          false,
          false,
          x.sort_order
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
          name text,
          quantity double precision,
          unit text,
          section text,
          preferred_store text,
          costco_bulk_candidate boolean,
          pantry_status text,
          notes text,
          sort_order int
        )
      `;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Insert failed" };
    }

    try {
      await insertGroceryItemSources(householdId, listId!, consolidated);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Source insert failed" };
    }
  }

  await query`
    UPDATE weekly_plans SET status = 'grocery_generated' WHERE id = ${weeklyPlanId}
  `;

  revalidatePath("/tools/meals/grocery", "layout");
  if (listId) revalidatePath(`/tools/meals/grocery/${listId}`);
  revalidatePath("/tools/meals/week", "layout");
  return { success: true, listId };
}

/** Rebuild generated items from the linked week calendar (manual adds are kept). */
export async function regenerateGroceryFromCalendar(listId: string) {
  const { householdId } = await requireHouseholdContext();

  const list = await queryOne<{ weekly_plan_id: string | null }>`
    SELECT weekly_plan_id FROM grocery_lists
    WHERE id = ${listId} AND household_id = ${householdId}
    LIMIT 1
  `;
  if (!list) return { error: "List not found" };
  if (!list.weekly_plan_id) {
    return { error: "This list isn't linked to a meal calendar." };
  }

  return generateGroceryList(list.weekly_plan_id, {
    overwriteEdited: true,
    quiet: false,
  });
}

export async function toggleGroceryItem(itemId: string, checked: boolean) {
  const { user, householdId } = await requireHouseholdContext();
  try {
    await query`
      UPDATE grocery_items SET
        is_checked = ${checked},
        checked_by = ${checked ? user.id : null},
        checked_at = ${checked ? new Date().toISOString() : null},
        pantry_status = ${checked ? "purchased" : "needed"}
      WHERE id = ${itemId} AND household_id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
  return { success: true };
}

/** Mark / unmark an item as a maybe-get-at-Costco candidate (stays on main list). */
export async function toggleGroceryCostco(itemId: string, onCostcoList: boolean) {
  const { householdId } = await requireHouseholdContext();
  try {
    const item = await queryOne<{
      name: string;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
    }>`
      SELECT name, quantity, unit, notes
      FROM grocery_items
      WHERE id = ${itemId} AND household_id = ${householdId}
      LIMIT 1
    `;
    if (!item) return { error: "Item not found" };

    const packed = packGroceryItemForStore(item, onCostcoList ? "costco" : "grocery");
    const preferredStore = onCostcoList ? "costco" : "any";

    await query`
      UPDATE grocery_items SET
        costco_bulk_candidate = ${onCostcoList},
        preferred_store = ${preferredStore},
        quantity = ${packed.quantity},
        unit = ${packed.unit},
        notes = ${packed.notes},
        is_user_edited = true
      WHERE id = ${itemId} AND household_id = ${householdId}
    `;
    return {
      success: true,
      item: {
        quantity: packed.quantity,
        unit: packed.unit,
        notes: packed.notes,
        costco_bulk_candidate: onCostcoList,
        preferred_store: preferredStore as "costco" | "any",
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function addManualGroceryItem(input: {
  listId: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  section?: string | null;
  sectionUserEdited?: boolean;
}) {
  const name = input.name.trim();
  if (!name) return { error: "Name is required" };
  const { householdId } = await requireHouseholdContext();
  const section = input.section ?? inferGrocerySection(name);
  try {
    const data = await queryOne<Record<string, unknown>>`
      INSERT INTO grocery_items (
        grocery_list_id, household_id, name, quantity, unit, section,
        preferred_store, is_manual, is_user_edited, pantry_status, sort_order
      ) VALUES (
        ${input.listId},
        ${householdId},
        ${name},
        ${input.quantity ?? null},
        ${input.unit ?? null},
        ${section},
        'any',
        true,
        ${input.sectionUserEdited ?? false},
        'needed',
        9999
      )
      RETURNING *
    `;
    return { success: true, item: data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Insert failed" };
  }
}

export async function updateGroceryItem(
  itemId: string,
  patch: {
    name?: string;
    quantity?: number | null;
    unit?: string | null;
    section?: string | null;
    notes?: string | null;
    preferredStore?: "king_soopers" | "whole_foods" | "costco" | "any";
  },
) {
  const { householdId } = await requireHouseholdContext();
  const sets: string[] = ["is_user_edited = true"];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, value: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(value);
  };

  if (patch.name !== undefined) add("name", patch.name);
  if (patch.quantity !== undefined) add("quantity", patch.quantity);
  if (patch.unit !== undefined) add("unit", patch.unit);
  if (patch.section !== undefined) add("section", patch.section);
  if (patch.notes !== undefined) add("notes", patch.notes);
  if (patch.preferredStore !== undefined)
    add("preferred_store", patch.preferredStore);

  vals.push(itemId, householdId);
  try {
    await getSql().query(
      `UPDATE grocery_items SET ${sets.join(", ")} WHERE id = $${i++} AND household_id = $${i}`,
      vals,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
  revalidatePath("/tools/meals/grocery", "layout");
  return { success: true };
}

/** Move an item to another aisle without forcing a full grocery page refresh. */
export async function updateGroceryItemSection(
  itemId: string,
  section: string,
) {
  const { householdId } = await requireHouseholdContext();
  const normalized = normalizeGrocerySection(section);
  if (!normalized) return { error: "Invalid grocery section" };

  try {
    await query`
      UPDATE grocery_items SET
        section = ${normalized},
        is_user_edited = true
      WHERE id = ${itemId} AND household_id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed" };
  }
  return { success: true };
}

export async function deleteGroceryItem(itemId: string) {
  const { householdId } = await requireHouseholdContext();
  try {
    await query`
      DELETE FROM grocery_items
      WHERE id = ${itemId} AND household_id = ${householdId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed" };
  }
  return { success: true };
}
