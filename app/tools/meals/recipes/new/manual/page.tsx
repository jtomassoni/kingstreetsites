import Link from "next/link";
import { RecipeForm } from "@meals/components/recipes/recipe-form";
import { Button } from "@meals/components/ui/button";
import { isAiEnabled } from "@meals/lib/env";

export default function ManualNewRecipePage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold">Add manually</h1>
          <p className="text-sm text-muted-foreground">
            For family recipes, or paste text and let AI structure it.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/tools/meals/recipes/new">Use lookup instead</Link>
        </Button>
      </div>
      <RecipeForm mode="create" aiEnabled={isAiEnabled()} />
    </div>
  );
}
