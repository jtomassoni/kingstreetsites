import { notFound } from "next/navigation";
import { getMealHistoryEntry } from "@meals/actions/history";
import { uploadMealPhoto } from "@meals/actions/photos";
import { Button } from "@meals/components/ui/button";
import { Input } from "@meals/components/ui/input";
import { Badge } from "@meals/components/ui/badge";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const entry = await getMealHistoryEntry(entryId);
  if (!entry) notFound();

  const title = entry.recipes?.title ?? "Meal";
  const photos = entry.meal_photos ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(entry.cooked_at).toLocaleString()}
        </p>
        <div className="mt-2 flex gap-1">
          {entry.overall_rating ? <Badge>{entry.overall_rating}★</Badge> : null}
          {entry.would_make_again ? <Badge variant="outline">Again: {entry.would_make_again}</Badge> : null}
        </div>
      </div>
      {entry.review ? <p className="text-sm">{entry.review}</p> : null}

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold">Photos</h2>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {photos.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-muted p-3 text-xs">
                {p.alt_text || "Meal photo"}
                <p className="mt-1 truncate text-muted-foreground">{p.storage_path}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          action={async (formData) => {
            "use server";
            await uploadMealPhoto(formData);
          }}
          className="space-y-2 rounded-xl border border-border p-3"
        >
          <input type="hidden" name="mealHistoryId" value={entryId} />
          <Input name="file" type="file" accept="image/*" capture="environment" required />
          <Input name="altText" placeholder="Alt text" defaultValue={`${title} photo`} />
          <Button type="submit">Upload photo</Button>
        </form>
      </section>
    </div>
  );
}
