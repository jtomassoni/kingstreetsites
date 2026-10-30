import { notFound } from "next/navigation";
import { getRecipeDetail } from "@meals/actions/recipes";
import { RecipeForm } from "@meals/components/recipes/recipe-form";
import { isAiEnabled } from "@meals/lib/env";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const detail = await getRecipeDetail(recipeId);
  if (!detail) notFound();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Improve recipe</h1>
      <p className="text-sm text-muted-foreground">
        Saving creates a new version and keeps the previous one for history.
        Paste a recipe to replace the stub fields.
      </p>
      <RecipeForm
        mode="edit"
        recipeId={recipeId}
        aiEnabled={isAiEnabled()}
        initial={{
          title: detail.recipe.title,
          description: detail.recipe.description,
          sourceType: detail.recipe.source_type,
          sourceName: detail.recipe.source_name,
          cuisine: detail.recipe.cuisine,
          defaultServings: detail.current?.default_servings ?? 1,
          difficulty: detail.current?.difficulty,
          ingredients: detail.ingredients.map((i) => ({
            ingredientName: i.ingredient_name,
            quantity: i.quantity?.toString() ?? "",
            unit: i.unit ?? "",
            preparationNote: i.preparation_note ?? "",
            groceryCategory: i.grocery_category ?? "",
          })),
          steps: detail.steps.map((s) => ({ instruction: s.instruction })),
        }}
      />
    </div>
  );
}
