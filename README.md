# Hangr

A closet app modelled on [Starlook](https://apps.apple.com/us/app/starlook/id6764362627):
photograph your clothes and they're redrawn as clean e-commerce product shots,
looking worn by an invisible mannequin. Then mix them into outfits.

See [`docs/starlook-notes.md`](docs/starlook-notes.md) for the look and the
screens we're replicating.

| Folder | What | Stack |
|---|---|---|
| [`pipeline/`](pipeline/README.md) | Photo → product shot → transparent cutout | Python; OpenAI/Gemini image editing; BiRefNet on a Modal GPU |
| [`app/`](app/) | The mobile app: wardrobe grid, add a photo, review flagged items | Expo (React Native) + TypeScript |
| [`supabase/`](supabase/README.md) | Items, Storage, access rules and the `jobs` Edge Function that hands work to the worker | Supabase (Postgres, Storage, Deno) |

## How an item is processed

1. **Enhance:** an image-edit model redraws the photo as a catalogue shot.
   Clothes are shown on an invisible (ghost) mannequin with body volume; shoes,
   bags and jewellery as product photos. The prompt depends on the item's
   category.
2. **Fidelity check:** a Gemini vision model compares the photo with the
   product shot (colours, print, text, hardware, cut). If the model changed
   the item, it retries once with the list of differences to fix; a near miss
   is kept but flagged for review, anything worse falls back to the original
   photo. In the app, a flagged item gets a Review badge: the user keeps it,
   swaps in their own photo, or regenerates it with a short note.
3. **Cutout:** background removal, cropped and centred on a square, plus a
   thumbnail for the grid.

## Run the app

```bash
cd app
npm install
npx expo start          # press w for web, or scan the QR code with Expo Go
```

Without Supabase settings the app shows a few bundled sample items. To use
the backend, copy `app/.env.example` to `app/.env.local` and fill it in
(deploy steps: [`supabase/README.md`](supabase/README.md)).

## Planned architecture

- **App:** Expo + TypeScript, built and shipped with EAS.
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions). Images go
  in Storage and their paths in an `item_assets` table, so files can move to
  Cloudflare R2 later if download costs grow.
- **Processing:** an upload triggers an Edge Function, which calls the Modal
  GPU worker (`pipeline/modal_app.py`). The worker writes the assets back to
  Storage, and the app updates over Realtime.

## Next steps

1. Run the enhance step on real clothing photos and tune the prompt against Starlook's look.
2. Deploy the Supabase backend and Modal worker (code is in place, see `supabase/README.md`), then add the `outfits` table and real sign-in (accounts are anonymous guests for now).
3. Build the Starlook screens: wardrobe grid, batch import with auto-tagging, outfit shuffler, canvas, calendar.
