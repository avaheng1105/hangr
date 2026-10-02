"""Step 1: polish the photo with an image-edit model.

Providers are called through their official SDKs, which are imported lazily
so the rest of the pipeline works without them installed.
API keys come from the standard env vars: OPENAI_API_KEY / GEMINI_API_KEY.
"""

from __future__ import annotations

import base64

from PIL import Image

from .config import PipelineConfig
from .imageio import from_bytes, to_png_bytes
from .prompts import build_prompt

# Image-edit models work at roughly 1-1.5k px; sending more just costs time.
_MAX_UPLOAD = 1536


class EnhanceError(RuntimeError):
    pass


def enhance(image: Image.Image, cfg: PipelineConfig) -> Image.Image:
    """Return a polished version of `image` using the configured provider."""
    if cfg.enhance_provider == "openai":
        return _enhance_openai(image, cfg)
    if cfg.enhance_provider == "gemini":
        return _enhance_gemini(image, cfg)
    raise ValueError(f"unknown enhance provider: {cfg.enhance_provider!r}")


def _prepare(image: Image.Image) -> bytes:
    image = image.copy()
    image.thumbnail((_MAX_UPLOAD, _MAX_UPLOAD), Image.Resampling.LANCZOS)
    return to_png_bytes(image)


def _enhance_openai(image: Image.Image, cfg: PipelineConfig) -> Image.Image:
    from openai import OpenAI

    client = OpenAI()
    result = client.images.edit(
        model=cfg.openai_model,
        image=("garment.png", _prepare(image), "image/png"),
        prompt=build_prompt(cfg.category),
        size="auto",
        quality="high",
        output_format="png",
    )
    if not result.data or not result.data[0].b64_json:
        raise EnhanceError("OpenAI returned no image")
    return from_bytes(base64.b64decode(result.data[0].b64_json))


def _enhance_gemini(image: Image.Image, cfg: PipelineConfig) -> Image.Image:
    from google import genai
    from google.genai import types

    client = genai.Client()
    response = client.models.generate_content(
        model=cfg.gemini_model,
        contents=[
            types.Part.from_bytes(data=_prepare(image), mime_type="image/png"),
            build_prompt(cfg.category),
        ],
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    for candidate in response.candidates or []:
        for part in (candidate.content.parts if candidate.content else None) or []:
            if part.inline_data and part.inline_data.data:
                return from_bytes(part.inline_data.data)
    raise EnhanceError("Gemini returned no image")
