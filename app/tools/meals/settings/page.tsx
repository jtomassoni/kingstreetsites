import { requireHouseholdContext } from "@meals/lib/auth/session";
import { listHouseholdRecipeSummaries } from "@meals/actions/recipes";
import { queryOne } from "@meals/lib/db";
import { SettingsEditor } from "@meals/components/settings/settings-editor";

export default async function SettingsPage() {
  const { user } = await requireHouseholdContext();
  const [profile, recipes] = await Promise.all([
    queryOne<import("@meals/types/database").Profile>`
      SELECT * FROM profiles WHERE id = ${user.id} LIMIT 1
    `,
    listHouseholdRecipeSummaries(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 md:max-h-[calc(100dvh-4.5rem)] md:min-h-0 md:gap-2.5 md:overflow-hidden">
      <h1 className="shrink-0 font-display text-2xl font-semibold tracking-tight md:text-2xl">
        Settings
      </h1>
      <SettingsEditor
        mealDefaults={profile?.meal_defaults}
        recipes={recipes.map((r) => ({
          id: r.id,
          title: r.title,
          mealTypes: r.meal_types ?? [],
        }))}
      />
    </div>
  );
}
