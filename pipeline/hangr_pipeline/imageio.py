"""Small helpers for loading, normalising and encoding images."""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageOps


def from_bytes(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def normalize(image: Image.Image, max_size: int) -> Image.Image:
    """Apply EXIF rotation, flatten to RGB and cap the longest side."""
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        image = background
    else:
        image = image.convert("RGB")
    image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    return image


def to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def to_webp_bytes(image: Image.Image, quality: int = 85) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


def to_float(image: Image.Image) -> np.ndarray:
    """RGB(A) image -> float32 array in 0..1, shape (H, W, C)."""
    return np.asarray(image, dtype=np.float32) / 255.0


def from_float(array: np.ndarray) -> Image.Image:
    """Float array in 0..1 -> 8-bit image (L, RGB or RGBA from the shape)."""
    data = (np.clip(array, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    return Image.fromarray(data)
