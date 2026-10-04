"""Check that the enhanced image still shows the same item.

Two methods:

- `judge_gemini`: a Gemini vision model compares the original photo with the
  enhanced one and lists concrete differences (colours, print, text, hardware,
  cut). It sees shape changes (e.g. flared jeans turned straight) and doesn't
  need a cutout of the original, which is unreliable on busy backgrounds.
- `similarity`: a cheap, deterministic colour-histogram comparison of the two
  cutouts. No API call, but it can't see shape and needs a clean cutout of
  the original photo.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from scipy import ndimage

from .config import PipelineConfig
from .imageio import to_png_bytes

log = logging.getLogger(__name__)

_BINS = 6  # per channel -> 216 colour buckets


def colour_histogram(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    weights = alpha.reshape(-1)
    idx = np.clip((rgb.reshape(-1, 3) * _BINS).astype(int), 0, _BINS - 1)
    flat = idx[:, 0] * _BINS * _BINS + idx[:, 1] * _BINS + idx[:, 2]
    hist = np.bincount(flat, weights=weights, minlength=_BINS**3)
    total = hist.sum()
    return hist / total if total > 0 else hist


def similarity(
    rgb_a: np.ndarray, alpha_a: np.ndarray, rgb_b: np.ndarray, alpha_b: np.ndarray
) -> float:
    """Histogram intersection in 0..1 (1 = identical colour distribution).

    The histograms are blurred slightly so a small lighting shift between
    neighbouring buckets is not counted as a mismatch.
    """
    def smooth(h: np.ndarray) -> np.ndarray:
        cube = ndimage.gaussian_filter(h.reshape(_BINS, _BINS, _BINS), 0.6, mode="constant")
        return cube.reshape(-1) / max(cube.sum(), 1e-9)

    a = smooth(colour_histogram(rgb_a, alpha_a))
    b = smooth(colour_histogram(rgb_b, alpha_b))
    return float(np.minimum(a, b).sum())


@dataclass
class Verdict:
    score: int  # 1-10, how faithfully the enhanced image shows the item
    issues: list[str] = field(default_factory=list)  # concrete differences
    # Whether the image follows the house style (see check_style). Its
    # problems are in `issues` too, so a retry fixes them.
    style_ok: bool = True


_JUDGE_PROMPT = """\
Image 1 is a phone photo of a clothing item or accessory. Image 2 is an
AI-generated product shot that must show the SAME item, restyled for a shop:
on an invisible mannequin or as a product photo, on a plain background.

Ignore everything that is meant to change: background, lighting, camera
angle, pose, mannequin volume, wrinkles and folds, and how the item is laid
out.

Compare only the item itself:
- type of item
- colours and fabric texture
- print or pattern: the motifs, their arrangement, roughly how many
- text and logos
- hardware and trims: buttons, zips, drawstrings, pockets, belts, bows
- cut and silhouette: length, leg shape (flared, wide, straight, skinny),
  sleeve length, neckline, hem shape, fit

Give a score from 1 to 10 for how faithfully image 2 shows the item in
image 1 (10 = a shopper would recognise it as exactly the same item;
6 or below = something a shopper would notice is different). List each
concrete difference as a short instruction for fixing it, e.g. "the legs
should flare out from the knee". Leave the list empty if there are none.
"""

# Big enough to see prints and text, small enough to keep the call cheap.
_JUDGE_SIZE = 1024


def _image_part(image: Image.Image):
    from google.genai import types

    image = image.convert("RGB")
    image.thumbnail((_JUDGE_SIZE, _JUDGE_SIZE), Image.Resampling.LANCZOS)
    return types.Part.from_bytes(data=to_png_bytes(image), mime_type="image/png")


def _ask_gemini(contents: list, schema, cfg: PipelineConfig):
    """One structured-output call to the judge model, retrying transient errors."""
    from google import genai
    from google.genai import types

    client = genai.Client()
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        temperature=0,
    )
    for attempt in range(1 + cfg.judge_retries):
        try:
            response = client.models.generate_content(
                model=cfg.judge_model, contents=contents, config=config
            )
            break
        except Exception as exc:
            if attempt == cfg.judge_retries or not is_transient(exc):
                raise
            delay = cfg.judge_retry_delay * 2**attempt
            log.warning("judge call failed (%s), retrying in %.0fs", exc, delay)
            time.sleep(delay)
    parsed = response.parsed
    if not isinstance(parsed, schema):
        raise RuntimeError(f"judge returned no verdict: {response.text!r}")
    return parsed


def judge_gemini(original: Image.Image, enhanced: Image.Image, cfg: PipelineConfig) -> Verdict:
    from pydantic import BaseModel

    class _Schema(BaseModel):
        score: int
        issues: list[str]

    parsed = _ask_gemini([_image_part(original), _image_part(enhanced), _JUDGE_PROMPT], _Schema, cfg)
    return Verdict(score=max(1, min(10, parsed.score)), issues=parsed.issues)


_STYLE_PROMPT = """\
The image is an AI-generated product shot of an item for a clothing shop.
- looks_flat: true if it shows clothing (a top, jacket, dress, trousers,
  shorts or skirt) that looks flat, as in a flat lay or a garment lying on a
  surface, rather than filled out by an invisible body. Always false for
  shoes, bags and accessories.
- cut_off: true if part of the item is cut off by the edge of the image.
- extra_objects: true if there is a person, a hanger, a visible mannequin,
  props or added text in the image.
"""

# What to tell the image model for each failed style rule.
_STYLE_FIXES = {
    "looks_flat": "Show the garment filled out by an invisible mannequin, not lying flat",
    "cut_off": "Show the whole item, with nothing cut off by the edge of the image",
    "extra_objects": "Show only the item: no person, hanger, mannequin, props or text",
}


def check_style(enhanced: Image.Image, cfg: PipelineConfig) -> list[str]:
    """Whether a product shot follows the house style, so every item in the
    closet looks the same way. Returns what to fix (empty if nothing).

    A separate call on the generated image alone: asked alongside the
    comparison with the photo (itself often a flat lay), the judge passed
    flat shots."""
    from pydantic import BaseModel

    class _Schema(BaseModel):
        looks_flat: bool
        cut_off: bool
        extra_objects: bool

    parsed = _ask_gemini([_image_part(enhanced), _STYLE_PROMPT], _Schema, cfg)
    return [fix for key, fix in _STYLE_FIXES.items() if getattr(parsed, key)]


# Rate limits and server-side failures usually clear within seconds.
_TRANSIENT_CODES = {408, 429, 500, 502, 503, 504}


def is_transient(exc: Exception) -> bool:
    """Whether retrying the same request might succeed."""
    import httpx
    from google.genai import errors

    if isinstance(exc, errors.APIError):
        return exc.code in _TRANSIENT_CODES
    return isinstance(exc, (httpx.TimeoutException, httpx.TransportError, ConnectionError))
