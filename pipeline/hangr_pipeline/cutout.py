"""Step 2: background removal and framing.

`alpha_mask` returns a soft alpha matte (float32, 0..1, shape HxW).
`frame` crops the garment, centres it on a square canvas and fixes the
colours of transparent pixels so resized or composited images get no dark fringes.
"""

from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

from .config import PipelineConfig
from .imageio import from_float, to_float

_rembg_sessions: dict = {}


def alpha_mask(image: Image.Image, cfg: PipelineConfig) -> np.ndarray:
    if cfg.cutout_method == "model":
        return _alpha_rembg(image, cfg.rembg_model)
    if cfg.cutout_method == "colorkey":
        return alpha_colorkey(image)
    raise ValueError(f"unknown cutout method: {cfg.cutout_method!r}")


def load_models(cfg: PipelineConfig) -> None:
    """Load the background-removal model now (e.g. at worker start-up)."""
    if cfg.cutout_method == "model":
        _rembg_session(cfg.rembg_model)


def _rembg_session(name: str):
    if name not in _rembg_sessions:
        import rembg

        _rembg_sessions[name] = rembg.new_session(name)
    return _rembg_sessions[name]


def _alpha_rembg(image: Image.Image, model: str) -> np.ndarray:
    import rembg

    mask = rembg.remove(image, session=_rembg_session(model), only_mask=True)
    return np.asarray(mask.convert("L"), dtype=np.float32) / 255.0


def alpha_colorkey(image: Image.Image) -> np.ndarray:
    """Background removal without ML, for photos on a plain background.

    The background is flood-filled inward from the image border, through
    smooth areas only, so it stops at the garment's outline. That handles
    soft shadows and lighting gradients on the background, and garment
    colours that are close to the background colour. The largest remaining
    shape is kept and its holes are filled.
    """
    rgb = to_float(image.convert("RGB"))
    h, w, _ = rgb.shape
    # Work at ~512 px: faster, and sensor noise averages out.
    scale = 512 / max(h, w)
    small = rgb if scale >= 1 else to_float(
        image.convert("RGB").resize((round(w * scale), round(h * scale)), Image.Resampling.BOX)
    )
    smooth = ndimage.gaussian_filter(small, (1.0, 1.0, 0))
    grad = np.zeros(smooth.shape[:2], dtype=np.float32)
    for c in range(3):
        grad = np.maximum(
            grad,
            np.hypot(ndimage.sobel(smooth[..., c], 0), ndimage.sobel(smooth[..., c], 1)),
        )

    # "Flat" = smoother than nearly all of the image border (assumed background).
    sh, sw = grad.shape
    b = max(2, min(sh, sw) // 40)
    border = np.ones_like(grad, dtype=bool)
    border[b:-b, b:-b] = False
    edges = grad >= max(0.05, 2.5 * float(np.percentile(grad[border], 95)))
    # Thicken edges by a pixel so the fill can't slip through small gaps.
    flat = ~ndimage.binary_dilation(edges)

    labels, _ = ndimage.label(flat)
    bg_labels = np.unique(labels[border & flat])
    background = np.isin(labels, bg_labels[bg_labels > 0])

    solid = ndimage.binary_opening(~background, iterations=2)
    labels, count = ndimage.label(solid)
    if count == 0:
        return np.zeros((h, w), dtype=np.float32)
    sizes = ndimage.sum(solid, labels, index=range(1, count + 1))
    solid = ndimage.binary_fill_holes(labels == (int(np.argmax(sizes)) + 1))
    # The fill stops a little outside the outline; pull the edge back in.
    solid = ndimage.binary_erosion(solid, iterations=2)

    alpha = from_float(solid.astype(np.float32)).resize((w, h), Image.Resampling.BILINEAR)
    alpha = ndimage.gaussian_filter(to_float(alpha), max(0.7, 0.5 / scale))
    return _trim_background_fringe(rgb, alpha, small, sh, border)


def _trim_background_fringe(
    rgb: np.ndarray, alpha: np.ndarray, small: np.ndarray, sh: int, border: np.ndarray
) -> np.ndarray:
    """Recompute the alpha along the outline by unmixing garment and background.

    The flood fill stops a few pixels short of the true edge, so the mask
    includes a thin rim of pixels that are partly or wholly background. In a
    band along the outline, each pixel is treated as a blend of the plain
    background colour and the nearest interior garment colour, and its alpha
    becomes the garment's share of that blend. Where the garment is the same
    colour as the background the blend can't be told apart, so those pixels
    fall back to fading out by distance from the background colour. The
    interior is never touched, so white fabric on a light background stays
    solid.
    """
    bg = np.median(small[border], axis=0)
    # Edges are soft over a few pixels, so the pure garment colour is sampled
    # well inside the outline.
    depth = max(4, round(8 * alpha.shape[0] / max(sh, 1)))
    inside = alpha > 0.5
    core = ndimage.binary_erosion(inside, iterations=depth)
    band = (alpha > 0) & ~core
    if not core.any() or not band.any():
        return alpha

    # Nearest interior (pure garment) colour for every pixel.
    to_core, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    garment = rgb[iy, ix]
    towards_garment = garment - bg
    spread = np.sum(towards_garment**2, axis=2)
    share = np.sum((rgb - bg) * towards_garment, axis=2) / np.maximum(spread, 1e-6)
    unmixed = np.clip(share, 0.0, 1.0)

    dist = np.linalg.norm(rgb - bg, axis=2)
    noise = float(np.percentile(np.linalg.norm(small[border] - bg, axis=1), 95))
    t = np.clip((dist - max(0.02, 1.5 * noise)) / 0.06, 0.0, 1.0)
    faded = t * t * (3.0 - 2.0 * t)

    # Unmix only where the garment colour clearly differs from the background
    # and the sampled interior is nearby; thin parts without an interior
    # (straps, drawstrings) keep the plain fade.
    reliable = (spread > 0.15**2) & (to_core <= 1.5 * depth)
    edge_alpha = np.where(reliable, unmixed, faded)
    return np.where(band, np.minimum(alpha, edge_alpha), alpha).astype(np.float32)


def frame(
    image: Image.Image, alpha: np.ndarray, cfg: PipelineConfig
) -> tuple[np.ndarray, np.ndarray]:
    """Crop to the garment and centre it on a square canvas.

    Returns (rgb, alpha) as float arrays of size `cfg.output_size`.
    """
    rgb = to_float(image.convert("RGB"))
    ys, xs = np.nonzero(alpha > 0.05)
    if len(xs) == 0:
        raise ValueError("no garment found in the image")
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1

    rgb = rgb[y0:y1, x0:x1]
    alpha = alpha[y0:y1, x0:x1]

    size = cfg.output_size
    inner = int(round(size * (1.0 - 2.0 * cfg.padding)))
    ch, cw = alpha.shape
    scale = inner / max(ch, cw)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))

    rgb_img = from_float(rgb).resize((nw, nh), Image.Resampling.LANCZOS)
    alpha_img = from_float(alpha).resize((nw, nh), Image.Resampling.LANCZOS)

    out_rgb = np.zeros((size, size, 3), dtype=np.float32)
    out_alpha = np.zeros((size, size), dtype=np.float32)
    ox, oy = (size - nw) // 2, (size - nh) // 2
    out_rgb[oy : oy + nh, ox : ox + nw] = to_float(rgb_img)
    out_alpha[oy : oy + nh, ox : ox + nw] = to_float(alpha_img)
    return bleed_edges(out_rgb, out_alpha), out_alpha


def bleed_edges(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Copy the nearest fully opaque garment colour into every other pixel.

    Soft edge pixels are a blend of garment and background colour, which
    shows as a thin outline (dark on a dark background). And when an image
    is scaled, the colour of transparent pixels leaks into the edge.
    Replacing both with the nearest solid garment colour removes the rim
    while the alpha keeps the edge soft.
    """
    solid = alpha >= 0.98
    if not solid.any():
        return rgb
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    filled = rgb[iy, ix]
    return np.where(solid[..., None], rgb, filled)
