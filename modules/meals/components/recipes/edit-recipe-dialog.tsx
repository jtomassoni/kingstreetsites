"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  RecipeForm,
  type RecipeFormInitial,
} from "@meals/components/recipes/recipe-form";
import { Button } from "@meals/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@meals/components/ui/dialog";

export function EditRecipeDialog({
  recipeId,
  initial,
  aiEnabled = false,
}: {
  recipeId: string;
  initial: RecipeFormInitial;
  aiEnabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="min-h-10 flex-1 gap-1.5 min-[480px]:flex-none"
        >
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Improve recipe</DialogTitle>
          <DialogDescription>
            Paste feedback to tweak this recipe, or edit the fields. Saving
            creates a new version and keeps the previous one.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <RecipeForm
            key={recipeId}
            mode="edit"
            recipeId={recipeId}
            initial={initial}
            aiEnabled={aiEnabled}
            onSuccess={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
