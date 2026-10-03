"""The full item pipeline: photo in, product-shot assets out.

    original photo
      -> enhance (image-edit model)          optional, falls back to original
      -> fidelity check (colour histogram)   retry, then fall back
      -> background removal + framing
      -> assets: original, enhanced, cutout, thumb + metadata
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from . import cutout, fidelity
from .config import PipelineConfig
from .enhance import enhance
from .imageio import from_bytes, from_float, normalize, to_png_bytes, to_webp_bytes
from .prompts import ENHANCE_PROMPT_VERSION, build_prompt

log = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    # File name -> encoded bytes. Names match the `kind` column of item_assets.
    assets: dict[str, bytes] = field(default_factory=dict)
    meta: dict = field(default_factory=dict)


def load_models(cfg: PipelineConfig) -> None:
    """Load ML models up front so the first item isn't slow."""
    cutout.load_models(cfg)


def process(photo: bytes | Image.Image, cfg: PipelineConfig | None = None) -> PipelineResult:
    cfg = cfg or PipelineConfig()
    if cfg.enhance_provider != "none":
        build_prompt(cfg.category)  # fail fast on a bad category, before any work
    timings: dict[str, float] = {}

    def timed(name: str, fn, *args):
        start = time.perf_counter()
        try:
            return fn(*args)
        finally:
            timings[name] = round(timings.get(name, 0.0) + time.perf_counter() - start, 3)

    image = from_bytes(photo) if isinstance(photo, bytes) else photo
    original = normalize(image, cfg.max_input_size)
    result = PipelineResult()
    result.assets["original.webp"] = to_webp_bytes(original)

    orig_alpha = timed("cutout", cutout.alpha_mask, original, cfg)
    rgb, alpha = timed("frame", cutout.frame, original, orig_alpha, cfg)

    enhance_meta: dict = {"provider": cfg.enhance_provider, "used": False}
    if cfg.enhance_provider != "none":
        enhance_meta["prompt_version"] = ENHANCE_PROMPT_VERSION
        enhance_meta["category"] = cfg.category
        enhance_meta["attempts"] = []
        for _ in range(1 + cfg.enhance_retries):
            attempt: dict = {}
            enhance_meta["attempts"].append(attempt)
            try:
                enhanced = normalize(timed("enhance", enhance, original, cfg), cfg.max_input_size)
                e_alpha = timed("cutout", cutout.alpha_mask, enhanced, cfg)
                e_rgb, e_alpha = timed("frame", cutout.frame, enhanced, e_alpha, cfg)
            except Exception as exc:  # network, provider refusal, empty result...
                log.warning("enhance attempt failed: %s", exc)
                attempt["error"] = str(exc)
                continue
            score = fidelity.similarity(rgb, alpha, e_rgb, e_alpha)
            attempt["fidelity"] = round(score, 3)
            result.assets["enhanced.webp"] = to_webp_bytes(enhanced)
            if score >= cfg.fidelity_threshold:
                rgb, alpha = e_rgb, e_alpha
                enhance_meta["used"] = True
                break
            log.warning("enhanced image failed fidelity check (%.2f)", score)

    cutout_img = from_float(np.dstack([rgb, alpha]))
    result.assets["cutout.png"] = to_png_bytes(cutout_img)
    thumb = cutout_img.resize((cfg.thumb_size, cfg.thumb_size), Image.Resampling.LANCZOS)
    result.assets["thumb.webp"] = to_webp_bytes(thumb)

    result.meta = {
        "enhance": enhance_meta,
        "cutout_method": cfg.cutout_method,
        "size": cfg.output_size,
        "timings_s": timings,
    }
    return result
