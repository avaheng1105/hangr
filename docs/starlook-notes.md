# Starlook: what we're replicating

Notes from Starlook's App Store screenshots
([listing](https://apps.apple.com/us/app/starlook/id6764362627)). These come
from looking at the screenshots only. How Starlook works internally isn't
public.

## The item image (the part that matters most)

- Every item is shown as a **catalogue product shot**, not the user's photo.
  Clothes look **worn by an invisible mannequin** (ghost mannequin): shoulders,
  bust and waist are filled out; sleeves hang naturally, slightly away from the
  body; flared sleeves, collars, bows and belts keep their shape; on open
  necklines the inside of the back collar is visible.
- **Front view**, item centred and filling the tile.
- **Soft, even studio lighting** with gentle shading that shows form. **No cast
  shadow.** Crisp edges, so the background has been removed.
- Shown on plain **white**, both in the grid and on the canvas.
- Non-clothing items get product-shot styling: shoes as a pair at a
  three-quarter angle, bags upright with straps up, earrings as a pair.
- **No interactive 3D.** The "3D-ish" feel comes entirely from the generated
  mannequin volume and lighting. Our tilt viewer is an extra on top of that.

This look is what `pipeline/hangr_pipeline/prompts.py` (v2) targets: one
shared set of rules (lighting, background, keep every detail) plus a styling
block per category.

## Screens and features

| Starlook | What it does | Hangr status |
|---|---|---|
| **Wardrobe** | Left rail of categories (Tops, Bottoms, Dress, Shoes, Bags, Accessories, Jewelry, Beauty), subcategory chips (All, T-Shirt, Shirt, Sweater…), 2-column grid of cutouts on white tiles, favourite heart | To build |
| **Quick Import** | Batch upload of several photos; each becomes a product shot; auto-filled Name, Category ("Tops-T-Shirt"), Season (Spr/Sum/Aut/Win), Color; Brand and Size; an edit button on the image | Pipeline done; auto-tagging to build (vision model) |
| **StarLook (outfit shuffler)** | Stacked rows of tops / bottoms / shoes you swipe through; 2-, 3- or 4-row layouts; shuffle button; Save | To build (the "slot mode" in our plan) |
| **Canvas** | Free collage: drag, resize, rotate, layer order, undo; background, templates, text, extra materials | To build (the "canvas mode" in our plan) |
| **Outfits** | Saved looks | To build |
| **Calendar** | Plan or log outfits by date (the `wear_log` table in our plan) | To build |
