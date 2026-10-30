import { NewRecipeLookup } from "@meals/components/recipes/new-recipe-lookup";

export default function NewRecipePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">New recipe</h1>
        <p className="text-sm text-muted-foreground">
          Name a dish — we&apos;ll check your library, then draft a baseline you
          can edit.
        </p>
      </div>
      <NewRecipeLookup />
    </div>
  );
}
