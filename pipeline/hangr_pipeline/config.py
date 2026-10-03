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
FidelityMethod = Literal["auto", "gemini", "colour"]


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
        default_factory=lambda: _env("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-lite-image")
    )
    # Item type, which picks the styling in the prompt (see prompts.CATEGORIES).
    # "auto" lets the image model decide.
    category: str = "auto"
    # Retries of the enhance step when the fidelity check fails, before
    # falling back to the original photo.
    enhance_retries: int = 1
    # How to check the enhanced image still shows the same item:
    #   gemini -> a Gemini vision model compares both photos (colours, print,
    #             text, hardware, cut). Needs GEMINI_API_KEY.
    #   colour -> colour histograms of the two cutouts. No API call, but it
    #             needs a clean cutout of the original photo and can't see
    #             shape changes.
    #   auto   -> gemini when enhancing with Gemini, otherwise colour.
    fidelity_method: FidelityMethod = field(
        default_factory=lambda: _env("FIDELITY_METHOD", "auto")  # type: ignore[return-value]
    )
    judge_model: str = field(default_factory=lambda: _env("JUDGE_MODEL", "gemini-flash-latest"))
    # Extra tries of the judge call on transient errors (rate limit, 5xx,
    # timeout), waiting judge_retry_delay seconds, then twice that, ... If it
    # still fails, the image is kept but flagged needs_review, never accepted.
    judge_retries: int = 2
    judge_retry_delay: float = 2.0
    # Minimum judge score (1-10) to accept the enhanced image.
    fidelity_min_score: int = 7
    # If no attempt reaches fidelity_min_score, the best attempt is still used
    # (flagged needs_review) when it scores at least this; below it, the
    # original photo is used.
    fidelity_review_score: int = 5
    # Minimum colour-histogram similarity (0..1), for the colour method.
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
