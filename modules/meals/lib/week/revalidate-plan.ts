import { revalidatePath } from "next/cache";
import { queryOne } from "@meals/lib/db";
import { toDateOnlyString } from "@meals/lib/dates";

/** Invalidate week calendar pages after plan mutations. */
export async function revalidateWeekPlan(weeklyPlanId?: string) {
  if (weeklyPlanId) {
    const plan = await queryOne<{ week_start: string }>`
      SELECT week_start FROM weekly_plans WHERE id = ${weeklyPlanId} LIMIT 1
    `;
    if (plan) {
      revalidatePath(`/tools/meals/week/${toDateOnlyString(plan.week_start)}`);
    }
  }
  revalidatePath("/tools/meals/week");
}
