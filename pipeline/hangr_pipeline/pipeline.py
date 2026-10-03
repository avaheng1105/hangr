"""The full item pipeline: photo in, product-shot assets out.

    original photo
      -> enhance (image-edit model)          optional, falls back to original
      -> fidelity check (vision judge or colour)  retry with feedback, then fall back
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
from .enhance import enhance, pick_background
from .imageio import from_bytes, from_float, normalize, to_png_bytes, to_webp_bytes
from .prompts import ENHANCE_PROMPT_VERSION, build_prompt

log = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    # File name -> encoded bytes. Names match the `kind` column of item_assets.
    assets: dict[str, bytes] = field(default_factory=dict)
    meta: dict = field(default_factory=dict)


def _fidelity_method(cfg: PipelineConfig) -> str:
    if cfg.fidelity_method == "auto":
        return "gemini" if cfg.enhance_provider == "gemini" else "colour"
    return cfg.fidelity_method


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

    # The original photo's cutout is only needed for the colour check, or as
    # the fallback when no enhanced image is accepted.
    original_cut: tuple[np.ndarray, np.ndarray] | None = None

    def cut_original() -> tuple[np.ndarray, np.ndarray]:
        nonlocal original_cut
        if original_cut is None:
            orig_alpha = timed("cutout", cutout.alpha_mask, original, cfg)
            original_cut = timed("frame", cutout.frame, original, orig_alpha, cfg)
        return original_cut

    chosen: tuple[np.ndarray, np.ndarray] | None = None
    enhance_meta: dict = {"provider": cfg.enhance_provider, "used": False}
    if cfg.enhance_provider != "none":
        method = _fidelity_method(cfg)
        enhance_meta.update(
            prompt_version=ENHANCE_PROMPT_VERSION,
            category=cfg.category,
            fidelity_method=method,
            attempts=[],
        )
        feedback: list[str] | None = None
        # Best judged attempt so far: (score, enhanced image, its cutout).
        best: tuple[int, Image.Image, tuple[np.ndarray, np.ndarray]] | None = None
        # An attempt the judge couldn't check (judge call failed).
        unchecked: tuple[Image.Image, tuple[np.ndarray, np.ndarray]] | None = None
        for _ in range(1 + cfg.enhance_retries):
            attempt: dict = {}
            enhance_meta["attempts"].append(attempt)
            try:
                raw = timed("enhance", enhance, original, cfg, feedback)
                enhanced = normalize(raw, cfg.max_input_size)
                e_alpha = timed("cutout", cutout.alpha_mask, enhanced, cfg)
                e_cut = timed("frame", cutout.frame, enhanced, e_alpha, cfg)
            except Exception as exc:  # network, provider refusal, empty result...
                log.warning("enhance attempt failed: %s", exc)
                attempt["error"] = str(exc)
                continue
            if method == "gemini":
                try:
                    verdict = timed("judge", fidelity.judge_gemini, original, enhanced, cfg)
                except Exception as exc:
                    # The judge already retried transient errors. Keep the
                    # image for the user to review rather than accepting it
                    # unchecked, and stop: another enhance can't be judged either.
                    log.warning("fidelity judge failed, flagging for review: %s", exc)
                    attempt["judge_error"] = str(exc)
                    unchecked = (enhanced, e_cut)
                    break
                attempt["score"] = verdict.score
                attempt["issues"] = verdict.issues
                passed = verdict.score >= cfg.fidelity_min_score
                feedback = verdict.issues or None
                if best is None or verdict.score > best[0]:
                    best = (verdict.score, enhanced, e_cut)
            else:
                score = fidelity.similarity(*cut_original(), *e_cut)
                attempt["fidelity"] = round(score, 3)
                passed = score >= cfg.fidelity_threshold
            result.assets["enhanced.webp"] = to_webp_bytes(enhanced)
            if passed:
                chosen = e_cut
                break
            log.warning("enhanced image failed the fidelity check: %s", attempt)

        if chosen is None and best is not None and best[0] >= cfg.fidelity_review_score:
            # Close but not quite: better than a raw photo, but let the user
            # look at it (the app can offer "retry" / "use my photo").
            chosen = best[2]
            result.assets["enhanced.webp"] = to_webp_bytes(best[1])
            enhance_meta["needs_review"] = True
            enhance_meta["review_reason"] = "low_score"
        elif chosen is None and unchecked is not None:
            # Unknown fidelity, so never accepted outright: shown flagged,
            # the same way as a near miss.
            chosen = unchecked[1]
            result.assets["enhanced.webp"] = to_webp_bytes(unchecked[0])
            enhance_meta["needs_review"] = True
            enhance_meta["review_reason"] = "judge_failed"
        enhance_meta["used"] = chosen is not None
        enhance_meta["background"] = pick_background(original)

    rgb, alpha = chosen if chosen is not None else cut_original()
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
