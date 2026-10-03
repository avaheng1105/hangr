import type { Item } from './items';

// The user's note goes into the image prompt; the pipeline trims it to the
// same length (pipeline.NOTE_MAX_CHARS).
export const NOTE_MAX_CHARS = 200;

export class NotConnectedError extends Error {}

// Re-runs the item through the pipeline (one image call and one judge call)
// with the user's note. The result is judged again, so the returned item may
// be flagged again.
//
// The worker side exists (`Pipeline.regenerate` in pipeline/modal_app.py),
// but the backend that would call it from the app (Supabase Edge Function,
// README "Next steps") isn't built yet, so this always fails for now.
export async function regenerateItem(item: Item, note: string): Promise<Item> {
  void item;
  void note;
  throw new NotConnectedError(
    "Regenerating needs the Hangr backend, which isn't set up yet. You can keep the image or use your photo for now.",
  );
}
