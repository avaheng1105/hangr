"""Step 3: depth map for the tilt viewer.

The output is a float32 HxW array in 0..1 where 1 is closest to the
viewer and 0 is the garment's outline / the background. The viewer pushes
each pixel towards the camera by this amount.
"""

from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

from .config import PipelineConfig
from .imageio import from_float

_depth_pipelines: dict = {}


def depth_map(rgb: np.ndarray, alpha: np.ndarray, cfg: PipelineConfig) -> np.ndarray:
    shape = inflate(alpha)
    if cfg.depth_method == "inflate":
        depth = shape
    elif cfg.depth_method == "model":
        predicted = _normalize_within(_predict_depth(rgb, alpha, cfg.depth_model), alpha)
        # Pin the ML depth to zero at the outline so the silhouette stays put.
        depth = cfg.depth_model_mix * predicted * _edge_falloff(alpha) + (
            1.0 - cfg.depth_model_mix
        ) * shape
    else:
        raise ValueError(f"unknown depth method: {cfg.depth_method!r}")
    return _finish(depth, alpha)


def encode_16bit(depth: np.ndarray) -> Image.Image:
    """Pack 0..1 depth into an RGB image with 16-bit precision.

    R holds the high byte and G the low byte (B repeats R so the file still
    previews as a rough greyscale). 8 bits alone cause visible banding in the
    viewer's lighting. Decode: depth = (R * 256 + G) / 65535 (with bytes 0..255).
    """
    value = np.round(np.clip(depth, 0.0, 1.0) * 65535).astype(np.uint16)
    hi = (value >> 8).astype(np.uint8)
    lo = (value & 255).astype(np.uint8)
    return Image.fromarray(np.dstack([hi, lo, hi]))


def decode_16bit(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    return (rgb[..., 0] * 256 + rgb[..., 1]) / 65535


def load_models(cfg: PipelineConfig) -> None:
    """Load the depth model now (e.g. at worker start-up)."""
    if cfg.depth_method == "model":
        _depth_pipeline(cfg.depth_model)


def inflate(alpha: np.ndarray) -> np.ndarray:
    """Give a flat silhouette a rounded, pillow-like volume.

    Height grows with distance from the outline along a circular profile:
    steep at the edges, flat in the middle.
    """
    solid = alpha > 0.5
    if not solid.any():
        return np.zeros_like(alpha, dtype=np.float32)
    dist = ndimage.distance_transform_edt(solid)
    t = dist / dist.max()
    height = np.sqrt(1.0 - (1.0 - t) ** 2)
    # Round off the sharp ridge the distance transform leaves along the
    # middle of the shape (it reads as a crease when lit), then pin the
    # outline back to zero.
    height = ndimage.gaussian_filter(height, max(1.0, alpha.shape[0] / 60))
    height *= _edge_falloff(alpha, width=0.08)
    return (height / height.max()).astype(np.float32)


def _edge_falloff(alpha: np.ndarray, width: float = 0.15) -> np.ndarray:
    solid = alpha > 0.5
    if not solid.any():
        return np.zeros_like(alpha, dtype=np.float32)
    dist = ndimage.distance_transform_edt(solid)
    t = np.clip(dist / (dist.max() * width), 0.0, 1.0)
    return (t * t * (3.0 - 2.0 * t)).astype(np.float32)


def _normalize_within(depth: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    inside = depth[alpha > 0.5]
    if inside.size == 0:
        return np.zeros_like(depth, dtype=np.float32)
    lo, hi = np.percentile(inside, [2, 98])
    return np.clip((depth - lo) / max(hi - lo, 1e-6), 0.0, 1.0).astype(np.float32)


def _finish(depth: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    sigma = max(1.0, alpha.shape[0] / 256)
    depth = ndimage.gaussian_filter(depth.astype(np.float32), sigma) * alpha
    peak = depth.max()
    return depth / peak if peak > 0 else depth


def _depth_pipeline(model: str):
    if model not in _depth_pipelines:
        import torch
        from transformers import pipeline

        device = 0 if torch.cuda.is_available() else -1
        _depth_pipelines[model] = pipeline("depth-estimation", model=model, device=device)
    return _depth_pipelines[model]


def _predict_depth(rgb: np.ndarray, alpha: np.ndarray, model: str) -> np.ndarray:
    """Relative depth from Depth Anything (larger = closer), at input size."""
    # Show the model the garment on a plain grey background.
    grey = np.full_like(rgb, 0.85)
    composite = from_float(rgb * alpha[..., None] + grey * (1.0 - alpha[..., None]))
    result = _depth_pipeline(model)(composite)
    depth = result["depth"].convert("F")
    if depth.size != composite.size:
        depth = depth.resize(composite.size, Image.Resampling.BILINEAR)
    return np.asarray(depth, dtype=np.float32)
