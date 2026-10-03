"""Prompts for the image-edit step.

The target look is modelled on Starlook's wardrobe: every item is redrawn as
a catalogue product shot. Clothes appear worn by an invisible mannequin
(body-shaped volume, hollow neckline, natural drape); shoes, bags and jewellery
are shot like product photos. Soft, even studio light, no cast shadow, plain
background, and the item itself left exactly as it is.

The prompt is assembled per item category: shared rules + one styling block.
Bump ENHANCE_PROMPT_VERSION whenever any text here changes. It is stored with
each processed item so old items can be found and re-run.
"""

from __future__ import annotations

ENHANCE_PROMPT_VERSION = "v4"

_INTRO = "Turn this photo into a clean, high-end e-commerce product image of the same item."

_STYLES: dict[str, str] = {
    "top": """\
- Show the garment as if worn by an invisible mannequin (ghost mannequin
  photography): a realistic upper-body shape with natural 3D volume, shoulders
  filled out, the waist gently shaped, and soft natural fabric folds.
- Front view. Sleeves hang naturally, slightly away from the body, with their
  full length and cuff shape visible (keep flared or puffed sleeves as they are).
- Show the inside of the back neckline through the open collar, as in
  ghost-mannequin shots. Collars, lapels and ties sit as they would when worn.""",
    "outerwear": """\
- Show the jacket or coat as if worn by an invisible mannequin (ghost mannequin
  photography): realistic shoulders and torso volume, natural drape.
- Front view, worn closed if it was photographed closed, otherwise slightly
  open. Sleeves hang naturally with their full length visible.
- Show the inside of the back neckline and collar as in ghost-mannequin shots.""",
    "dress": """\
- Show the dress as if worn by an invisible mannequin (ghost mannequin
  photography): realistic bust, waist and hip shape, with the skirt falling
  naturally in soft folds to its true length.
- Front view. Straps, sleeves and neckline sit as they would when worn; show
  the inside of the back neckline where the front is open.""",
    "bottom": """\
- Show the trousers, jeans or shorts as if worn by an invisible mannequin
  (ghost mannequin photography): hips and legs filled out with natural 3D
  volume, fabric falling straight with soft folds to its true length.
- Front view. Show the waistband as a slightly open, rounded opening.
- Keep any belt, drawstring or tie exactly as it is.""",
    "skirt": """\
- Show the skirt as if worn by an invisible mannequin (ghost mannequin
  photography): hips filled out with natural 3D volume, the skirt falling
  naturally to its true length.
- Front view. Show the waistband as a slightly open, rounded opening.
- It is a skirt: no legs and no shorts underneath it, unless the photo shows
  built-in shorts. Keep wrap panels, slits, pleats and layers exactly as in
  the photo.""",
    "shoes": """\
- Show the pair side by side, standing upright on an invisible floor, angled
  slightly to show both the front and the side (three-quarter front view),
  as in a footwear catalogue.
- Shoes look new and filled out: no creases from wear, laces neatly tied.""",
    "bag": """\
- Show the bag standing upright, front view, with a full, structured shape as
  if lightly stuffed. Handles or straps arranged neatly above it.
- Hardware, clasps and logos clearly visible.""",
    "jewelry": """\
- Show the piece as a clean jewellery product shot, front view and centred.
  Earrings as a matching pair side by side; necklaces laid in a neat curve.
- Crisp detail on metal and stones, with soft natural reflections.""",
    "accessory": """\
- Show the item as a clean product shot, front view and centred, in its
  natural shape: hats upright, scarves loosely folded, belts in a neat coil or
  laid straight, glasses unfolded and facing forward.""",
}

_AUTO = (
    "First identify what the item is, then style it as follows.\n"
    "- Clothing (tops, jackets, dresses, trousers, skirts): show it as if worn by an "
    "invisible mannequin (ghost mannequin photography) with realistic body-shaped 3D "
    "volume and natural drape, front view, sleeves and legs hanging naturally, and the "
    "inside of the back neckline or waistband visible through the opening. Skirts "
    "have no legs or shorts underneath unless the photo shows built-in shorts.\n"
    "- Shoes: the pair side by side, three-quarter front view, filled out and new-looking.\n"
    "- Bags: upright, front view, full structured shape, straps arranged neatly.\n"
    "- Jewellery and other accessories: clean centred product shot, front view."
)

_RULES = """\
- Soft, even, diffused studio lighting from the front and slightly above.
  Gentle shading that shows the item's form. No cast shadow, no reflections on
  the floor, no vignette.
- Plain, flat, uniform {BACKGROUND} background. Nothing else in the frame: no
  hanger, no visible mannequin, no person, no props, no text, no watermark.
- Keep the item EXACTLY the same: identical colours, fabric texture, pattern,
  print, logos, text, buttons, zips, pockets, stitching, trims, and proportions.
  Do not add, remove, or redesign any detail. Keep belts, bows and ties that
  are part of the item.
- Keep the exact cut and silhouette: the same length, leg shape (flared,
  wide-leg, straight, skinny), sleeve length, neckline, hem shape and fit.
  Do not straighten flares, shorten or lengthen the item, or change its
  proportions.
- The whole item must be visible, centred, and filling most of the frame, with
  a little empty space around it.
- Photorealistic, sharp, high resolution, like a fashion retailer's product page."""

CATEGORIES = (*_STYLES, "auto")


LIGHT_BACKGROUND = "light grey (#EEEEEE)"
DARK_BACKGROUND = "dark charcoal grey (#3A3A3A)"


def build_prompt(
    category: str = "auto",
    feedback: list[str] | None = None,
    background: str = LIGHT_BACKGROUND,
) -> str:
    """The image-edit prompt for one item category (see CATEGORIES).

    `feedback` lists what a previous attempt got wrong (from the fidelity
    judge), so a retry can correct it. `background` should contrast with the
    item so the background can be removed cleanly afterwards.
    """
    if category == "auto":
        styling = _AUTO
    elif category in _STYLES:
        styling = _STYLES[category]
    else:
        raise ValueError(f"unknown category {category!r}; expected one of {CATEGORIES}")
    rules = _RULES.replace("{BACKGROUND}", background)
    prompt = f"{_INTRO}\n\n{styling}\n{rules}\n"
    if feedback:
        fixes = "\n".join(f"- {issue}" for issue in feedback)
        prompt += (
            "\nA previous attempt did not match the original item. Compared with the photo,"
            f" it got these details wrong, so get them right this time:\n{fixes}\n"
        )
    return prompt
