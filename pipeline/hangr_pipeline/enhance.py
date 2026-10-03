"""Step 1: polish the photo with an image-edit model.

Providers are called through their official SDKs, which are imported lazily
so the rest of the pipeline works without them installed.
API keys come from the standard env vars: OPENAI_API_KEY / GEMINI_API_KEY.
"""

from __future__ import annotations

import base64

import numpy as np
from PIL import Image

from .config import PipelineConfig
from .imageio import from_bytes, to_png_bytes
from .prompts import DARK_BACKGROUND, LIGHT_BACKGROUND, build_prompt

# Image-edit models work at roughly 1-1.5k px; sending more just costs time.
_MAX_UPLOAD = 1536


class EnhanceError(RuntimeError):
    pass


def enhance(
    image: Image.Image, cfg: PipelineConfig, feedback: list[str] | None = None
) -> Image.Image:
    """Return a polished version of `image` using the configured provider.

    `feedback` lists details a previous attempt got wrong.
    """
    prompt = build_prompt(cfg.category, feedback, pick_background(image))
    if cfg.enhance_provider == "openai":
        return _enhance_openai(image, cfg, prompt)
    if cfg.enhance_provider == "gemini":
        return _enhance_gemini(image, cfg, prompt)
    raise ValueError(f"unknown enhance provider: {cfg.enhance_provider!r}")


def pick_background(image: Image.Image) -> str:
    """A background colour that contrasts with the item.

    White fabric on a light grey background is hard to cut out cleanly, so
    light items get a dark background and everything else a light one. The
    item is assumed to fill the middle of the photo.
    """
    rgb = np.asarray(image.convert("RGB").resize((64, 64)), dtype=np.float32) / 255.0
    centre = rgb[20:44, 20:44].reshape(-1, 3)
    luminance = float(np.median(centre @ np.array([0.2126, 0.7152, 0.0722])))
    return DARK_BACKGROUND if luminance > 0.55 else LIGHT_BACKGROUND


def _prepare(image: Image.Image) -> bytes:
    image = image.copy()
    image.thumbnail((_MAX_UPLOAD, _MAX_UPLOAD), Image.Resampling.LANCZOS)
    return to_png_bytes(image)


def _enhance_openai(image: Image.Image, cfg: PipelineConfig, prompt: str) -> Image.Image:
    from openai import OpenAI

    client = OpenAI()
    result = client.images.edit(
        model=cfg.openai_model,
        image=("garment.png", _prepare(image), "image/png"),
        prompt=prompt,
        size="auto",
        quality="high",
        output_format="png",
    )
    if not result.data or not result.data[0].b64_json:
        raise EnhanceError("OpenAI returned no image")
    return from_bytes(base64.b64decode(result.data[0].b64_json))


def _enhance_gemini(image: Image.Image, cfg: PipelineConfig, prompt: str) -> Image.Image:
    from google import genai
    from google.genai import types

    client = genai.Client()
    response = client.models.generate_content(
        model=cfg.gemini_model,
        contents=[
            types.Part.from_bytes(data=_prepare(image), mime_type="image/png"),
            prompt,
        ],
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    for candidate in response.candidates or []:
        for part in (candidate.content.parts if candidate.content else None) or []:
            if part.inline_data and part.inline_data.data:
                return from_bytes(part.inline_data.data)
    raise EnhanceError("Gemini returned no image")
