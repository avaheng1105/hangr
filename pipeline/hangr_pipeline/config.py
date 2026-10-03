"""Pipeline settings.

Every option can be set from the CLI, from code, or from environment
variables (HANGR_*), so the same code runs locally and on Modal.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal

EnhanceProvider = Literal["none", "openai", "gemini"]
CutoutMethod = Literal["model", "colorkey"]


def _env(name: str, default: str) -> str:
    return os.environ.get(f"HANGR_{name}", default)


@dataclass
class PipelineConfig:
    # Step 1: polish the photo with an image-edit model.
    enhance_provider: EnhanceProvider = field(
        default_factory=lambda: _env("ENHANCE_PROVIDER", "none")  # type: ignore[return-value]
    )
    openai_model: str = field(default_factory=lambda: _env("OPENAI_IMAGE_MODEL", "gpt-image-2"))
    gemini_model: str = field(
        default_factory=lambda: _env("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
    )
    # Item type, which picks the styling in the prompt (see prompts.CATEGORIES).
    # "auto" lets the image model decide.
    category: str = "auto"
    # Retries of the enhance step when the fidelity check fails, before
    # falling back to the original photo.
    enhance_retries: int = 1
    # Minimum colour-histogram similarity (0..1) between original and enhanced.
    fidelity_threshold: float = 0.55

    # Step 2: background removal.
    #   model    -> BiRefNet via rembg (needs model weights; use on the GPU worker)
    #   colorkey -> no ML; works for photos on a plain background
    cutout_method: CutoutMethod = field(
        default_factory=lambda: _env("CUTOUT_METHOD", "model")  # type: ignore[return-value]
    )
    rembg_model: str = "birefnet-general"

    # Output sizes.
    max_input_size: int = 2048
    output_size: int = 1024
    thumb_size: int = 256
    # Empty margin around the garment, as a fraction of the output size.
    padding: float = 0.1
