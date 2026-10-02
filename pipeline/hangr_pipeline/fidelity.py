"""Check that the enhanced image still shows the same garment.

This is a cheap, deterministic colour check: it compares the colour
histograms of the garment (background excluded) in both images. It catches
the most visible failures — changed colours, a different garment, or a
blank result. A vision-model check for patterns and logos can be layered on
top later.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

_BINS = 6  # per channel -> 216 colour buckets


def colour_histogram(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    weights = alpha.reshape(-1)
    idx = np.clip((rgb.reshape(-1, 3) * _BINS).astype(int), 0, _BINS - 1)
    flat = idx[:, 0] * _BINS * _BINS + idx[:, 1] * _BINS + idx[:, 2]
    hist = np.bincount(flat, weights=weights, minlength=_BINS**3)
    total = hist.sum()
    return hist / total if total > 0 else hist


def similarity(
    rgb_a: np.ndarray, alpha_a: np.ndarray, rgb_b: np.ndarray, alpha_b: np.ndarray
) -> float:
    """Histogram intersection in 0..1 (1 = identical colour distribution).

    The histograms are blurred slightly so a small lighting shift between
    neighbouring buckets is not counted as a mismatch.
    """
    def smooth(h: np.ndarray) -> np.ndarray:
        cube = ndimage.gaussian_filter(h.reshape(_BINS, _BINS, _BINS), 0.6, mode="constant")
        return cube.reshape(-1) / max(cube.sum(), 1e-9)

    a = smooth(colour_histogram(rgb_a, alpha_a))
    b = smooth(colour_histogram(rgb_b, alpha_b))
    return float(np.minimum(a, b).sum())
