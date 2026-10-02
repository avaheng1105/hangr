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
DepthMethod = Literal["model", "inflate"]


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

    # Step 3: depth map.
    #   model   -> Depth Anything V2 blended with a silhouette "inflation"
    #   inflate -> silhouette inflation only (no ML)
    depth_method: DepthMethod = field(
        default_factory=lambda: _env("DEPTH_METHOD", "model")  # type: ignore[return-value]
    )
    depth_model: str = "depth-anything/Depth-Anything-V2-Small-hf"
    # How much of the ML depth to keep vs. the inflation shape (0..1).
    # Clothes photographed flat give a nearly flat ML depth map; the
    # inflation term gives them a soft, rounded volume.
    depth_model_mix: float = 0.5

    # Output sizes.
    max_input_size: int = 2048
    output_size: int = 1024
    thumb_size: int = 256
    # Empty margin around the garment, as a fraction of the output size.
    # Leaves room for the soft shadow and tilt in the viewer.
    padding: float = 0.1
