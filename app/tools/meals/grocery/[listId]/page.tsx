import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query, queryOne } from "@meals/lib/db";
import { GroceryListClient } from "@meals/components/grocery/grocery-list-client";
import {
  recipeLinksFromSourceNote,
  type GroceryRecipeLink,
} from "@meals/lib/grocery/recipe-links";
import {
  normalizeGrocerySection,
  resolveGrocerySection,
} from "@meals/lib/grocery/sections";
import type { GroceryItem, GroceryList } from "@meals/types/database";

export default async function GroceryListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const { householdId } = await requireHouseholdContext();

  const [list, lists, items, sourceRows, weekMeals] = await Promise.all([
    queryOne<GroceryList>`
      SELECT * FROM grocery_lists
      WHERE id = ${listId} AND household_id = ${householdId}
      LIMIT 1
    `,
    query<{
      id: string;
      status: string;
      generated_at: string | null;
      created_at: string;
    }>`
      SELECT id, status, generated_at, created_at
      FROM grocery_lists
      WHERE household_id = ${householdId}
      ORDER BY created_at DESC
    `,
    query<GroceryItem>`
      SELECT * FROM grocery_items
      WHERE grocery_list_id = ${listId}
      ORDER BY sort_order
    `,
    query<{
      grocery_item_id: string;
      title: string;
      recipe_id: string;
    }>`
      SELECT gis.grocery_item_id, pm.title, pm.recipe_id
      FROM grocery_item_sources gis
      JOIN grocery_items gi ON gi.id = gis.grocery_item_id
      JOIN planned_meals pm ON pm.id = gis.planned_meal_id
      WHERE gi.grocery_list_id = ${listId}
        AND gi.household_id = ${householdId}
        AND pm.recipe_id IS NOT NULL
    `,
    query<{ title: string; recipe_id: string }>`
      SELECT pm.title, pm.recipe_id
      FROM grocery_lists gl
      JOIN planned_meals pm ON pm.weekly_plan_id = gl.weekly_plan_id
      WHERE gl.id = ${listId}
        AND gl.household_id = ${householdId}
        AND pm.recipe_id IS NOT NULL
    `,
  ]);

  if (!list) notFound();

  // Keep manual aisle picks; re-resolve everyone else so "other" can improve.
  const resolvedItems = items.map((item) => ({
    ...item,
    section: item.is_user_edited
      ? (normalizeGrocerySection(item.section) ??
        resolveGrocerySection(item.section, item.name))
      : resolveGrocerySection(item.section, item.name),
  }));

  const storedLinks = new Map<string, GroceryRecipeLink[]>();
  for (const row of sourceRows) {
    const links = storedLinks.get(row.grocery_item_id) ?? [];
    links.push({ recipeId: row.recipe_id, mealTitle: row.title });
    storedLinks.set(row.grocery_item_id, links);
  }
  const mealRefs = weekMeals.map((meal) => ({
    title: meal.title,
    recipeId: meal.recipe_id,
  }));
  const recipeLinks: Record<string, GroceryRecipeLink[]> = {};
  for (const item of resolvedItems) {
    const links = storedLinks.get(item.id);
    const resolved = links?.length
      ? links
      : recipeLinksFromSourceNote(item.notes, mealRefs);
    if (resolved.length) recipeLinks[item.id] = resolved;
  }

  return (
    <GroceryListClient
      // Remount when the list is regenerated so client state isn’t stale.
      key={`${listId}-${list.generated_at ?? list.updated_at ?? list.created_at}`}
      listId={listId}
      weeklyPlanId={list.weekly_plan_id}
      items={resolvedItems}
      recipeLinks={recipeLinks}
      lists={lists.map((l) => ({
        id: l.id,
        status: l.status,
        generatedAt: l.generated_at ?? l.created_at,
      }))}
    />
  );
}
