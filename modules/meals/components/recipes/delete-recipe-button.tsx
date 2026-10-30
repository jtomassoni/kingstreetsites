"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Undo2 } from "lucide-react";
import { deleteRecipe, restoreRecipe } from "@meals/actions/recipes";
import { Button } from "@meals/components/ui/button";

export function DeleteRecipeButton({
  recipeId,
  title,
}: {
  recipeId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-10 flex-1 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive min-[480px]:flex-none"
      disabled={pending}
      onClick={() => {
        const confirmed = window.confirm(
          `Delete “${title}” from your library? Meals already on the calendar keep it.`,
        );
        if (!confirmed) return;
        start(async () => {
          const result = await deleteRecipe(recipeId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Recipe deleted");
          router.push("/tools/meals/recipes");
          router.refresh();
        });
      }}
    >
      <Trash2 className="size-3.5" aria-hidden />
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}

export function RestoreRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-10 gap-1.5"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const result = await restoreRecipe(recipeId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Recipe is back in your library");
          router.refresh();
        });
      }}
    >
      <Undo2 className="size-3.5" aria-hidden />
      {pending ? "Restoring…" : "Put back in library"}
    </Button>
  );
}
