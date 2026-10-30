import { requireHouseholdContext } from "@meals/lib/auth/session";
import { query, queryOne } from "@meals/lib/db";
import { createMealHistory } from "@meals/actions/history";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import { Textarea } from "@meals/components/ui/textarea";
import { redirect } from "next/navigation";

export default async function NewHistoryPage() {
  const { householdId } = await requireHouseholdContext();
  const recipes = await query<{ id: string; title: string }>`
    SELECT id, title FROM recipes
    WHERE household_id = ${householdId} AND is_active = true
    ORDER BY title
  `;

  async function save(formData: FormData) {
    "use server";
    const recipeId = String(formData.get("recipeId") || "") || null;
    let recipeVersionId: string | null = null;
    if (recipeId) {
      await requireHouseholdContext();
      const version = await queryOne<{ id: string }>`
        SELECT id FROM recipe_versions
        WHERE recipe_id = ${recipeId} AND is_current = true
        LIMIT 1
      `;
      recipeVersionId = version?.id ?? null;
    }
    const result = await createMealHistory({
      recipeId,
      recipeVersionId,
      overallRating: formData.get("rating") ? Number(formData.get("rating")) : null,
      wouldMakeAgain: (String(formData.get("again") || "") || null) as never,
      review: String(formData.get("review") || "") || null,
    });
    if (result.id) redirect(`/tools/meals/history/${result.id}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Log a meal</h1>
      <form action={save} className="space-y-3">
        <div className="space-y-1">
          <Label>Recipe</Label>
          <select name="recipeId" className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">No recipe</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Rating</Label>
          <Input name="rating" type="number" min={1} max={5} className="min-h-11" />
        </div>
        <div className="space-y-1">
          <Label>Make again?</Label>
          <select name="again" className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="maybe">Maybe</option>
            <option value="no">No</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Review</Label>
          <Textarea name="review" placeholder="Quick notes" />
        </div>
        <Button type="submit" size="lg" className="w-full">Save</Button>
      </form>
    </div>
  );
}
