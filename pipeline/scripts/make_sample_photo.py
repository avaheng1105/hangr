"""Draw a synthetic "phone photo" of a striped T-shirt on a plain background.

Used for tests, so the pipeline can be exercised without real photos or ML
models. Replace with real photos when you have them.

    python scripts/make_sample_photo.py samples/tshirt.jpg
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1600

# T-shirt outline on a 0..1 grid (clockwise from the left of the collar).
SHIRT = [
    (0.40, 0.14), (0.30, 0.17), (0.12, 0.29), (0.20, 0.43), (0.29, 0.38),
    (0.30, 0.86), (0.70, 0.86), (0.71, 0.38), (0.80, 0.43), (0.88, 0.29),
    (0.70, 0.17), (0.60, 0.14),
]


def shirt_mask(size: int = SIZE) -> Image.Image:
    """The T-shirt silhouette, with a scooped neckline cut out."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.polygon([(x * size, y * size) for x, y in SHIRT], fill=255)
    d.ellipse([0.40 * size, 0.08 * size, 0.60 * size, 0.21 * size], fill=0)
    return mask


def make_photo(size: int = SIZE, seed: int = 7) -> Image.Image:
    rng = np.random.default_rng(seed)
    mask = shirt_mask(size)

    # Fabric: navy / off-white stripes, red collar trim.
    yy, xx = np.mgrid[0:size, 0:size] / size
    stripe = (np.floor(yy * 26) % 2).astype(bool)
    fabric = np.where(stripe[..., None], [0.13, 0.18, 0.36], [0.94, 0.93, 0.89])
    collar = Image.new("L", (size, size), 0)
    ImageDraw.Draw(collar).ellipse(
        [0.385 * size, 0.065 * size, 0.615 * size, 0.225 * size], fill=255
    )
    collar_ring = (np.asarray(collar) > 0) & (np.asarray(mask) > 0)
    fabric[collar_ring] = [0.72, 0.16, 0.18]

    # Soft folds: low-frequency shading.
    noise = rng.normal(size=(12, 12))
    folds = np.asarray(
        Image.fromarray(noise.astype(np.float32)).resize((size, size), Image.Resampling.BICUBIC)
    )
    shade = 1.0 + 0.06 * folds - 0.10 * (xx - 0.5) ** 2
    fabric = np.clip(fabric * shade[..., None], 0, 1)

    # Background: warm grey with a light gradient and sensor noise.
    bg = np.array([0.80, 0.79, 0.76]) * (1.02 - 0.08 * yy)[..., None]
    shadow = np.asarray(
        mask.filter(ImageFilter.GaussianBlur(size * 0.02)).transform(
            mask.size, Image.Transform.AFFINE, (1, 0, -size * 0.012, 0, 1, -size * 0.018)
        ),
        dtype=np.float32,
    ) / 255
    bg = bg * (1 - 0.18 * shadow[..., None])

    alpha = np.asarray(mask.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32)[..., None] / 255
    photo = fabric * alpha + bg * (1 - alpha)
    photo += rng.normal(scale=0.012, size=photo.shape)
    return Image.fromarray((np.clip(photo, 0, 1) * 255).astype(np.uint8))


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "samples/tshirt.jpg")
    out.parent.mkdir(parents=True, exist_ok=True)
    make_photo().save(out, quality=90)
    print(f"wrote {out}")
