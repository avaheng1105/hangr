"""Prompts for the image-edit step.

Bump ENHANCE_PROMPT_VERSION whenever the prompt changes. It is stored with
each processed item so old items can be found and re-run.
"""

ENHANCE_PROMPT_VERSION = "v1"

ENHANCE_PROMPT = """\
Turn this clothing photo into a clean e-commerce product shot of the same garment.

- Show the garment front-on, as if worn by an invisible mannequin (ghost mannequin),
  with natural volume and soft fabric folds.
- Soft, even studio lighting from the upper left. No harsh shadows.
- Plain, flat, light grey background (#EEEEEE). Nothing else in the frame:
  no hanger, no mannequin, no person, no props, no text.
- Keep the garment EXACTLY the same: identical colours, pattern, print, logos,
  text, buttons, zips, pockets, stitching, and proportions. Do not add, remove,
  or redesign any detail.
- The whole garment must be visible and centred, with some empty space around it.
"""
