import io
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageFilter

from hangr_pipeline import PipelineConfig, pipeline, process
from hangr_pipeline.cutout import alpha_colorkey, frame
from hangr_pipeline.fidelity import similarity
from hangr_pipeline.imageio import to_float

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from make_sample_photo import make_photo, shirt_mask  # noqa: E402

SIZE = 800


@pytest.fixture(scope="module")
def photo() -> Image.Image:
    return make_photo(SIZE)


def no_ml(**overrides) -> PipelineConfig:
    cfg = PipelineConfig(enhance_provider="none", cutout_method="colorkey")
    for key, value in overrides.items():
        setattr(cfg, key, value)
    return cfg


def test_colorkey_matches_true_silhouette(photo):
    alpha = alpha_colorkey(photo) > 0.5
    truth = np.asarray(shirt_mask(SIZE)) > 127
    iou = (alpha & truth).sum() / (alpha | truth).sum()
    assert iou > 0.95


def test_frame_is_square_and_padded(photo):
    cfg = no_ml(output_size=256, padding=0.1)
    rgb, alpha = frame(photo, alpha_colorkey(photo), cfg)
    assert rgb.shape == (256, 256, 3) and alpha.shape == (256, 256)
    margin = int(256 * 0.1) - 1
    assert alpha[:margin].max() == 0 and alpha[-margin:].max() == 0
    # Transparent pixels carry garment colours, not black.
    assert rgb[alpha == 0].mean() > 0.2


def test_fidelity_separates_same_from_recoloured(photo):
    rgb = to_float(photo)
    alpha = alpha_colorkey(photo)
    recoloured = rgb[..., [2, 0, 1]]  # navy stripes -> brown
    assert similarity(rgb, alpha, rgb, alpha) == pytest.approx(1.0)
    assert similarity(rgb, alpha, recoloured, alpha) < 0.5


def test_process_without_ml(photo):
    buf = io.BytesIO()
    photo.save(buf, format="JPEG")
    result = process(buf.getvalue(), no_ml(output_size=256))

    assert set(result.assets) == {"original.webp", "cutout.png", "thumb.webp"}
    cutout = Image.open(io.BytesIO(result.assets["cutout.png"]))
    assert cutout.mode == "RGBA" and cutout.size == (256, 256)
    # Transparent corners, solid garment in the middle.
    a = np.asarray(cutout)[..., 3]
    assert a[0, 0] == 0 and a[128, 128] == 255
    assert result.meta["enhance"] == {"provider": "none", "used": False}


def test_enhanced_image_is_used_when_faithful(photo, monkeypatch):
    monkeypatch.setattr(pipeline, "enhance", lambda image, cfg: image.copy())
    result = process(photo, no_ml(enhance_provider="openai", output_size=256))
    assert result.meta["enhance"]["used"] is True
    assert len(result.meta["enhance"]["attempts"]) == 1
    assert "enhanced.webp" in result.assets


def test_falls_back_to_original_when_enhance_changes_colours(photo, monkeypatch):
    def recolour(image, cfg):
        return Image.fromarray(np.asarray(image)[..., [2, 0, 1]])

    monkeypatch.setattr(pipeline, "enhance", recolour)
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))
    meta = result.meta["enhance"]
    assert meta["used"] is False
    assert len(meta["attempts"]) == 2  # first try + one retry
    assert all(a["fidelity"] < 0.55 for a in meta["attempts"])


def test_falls_back_to_original_when_enhance_errors(photo, monkeypatch):
    def boom(image, cfg):
        raise RuntimeError("provider down")

    monkeypatch.setattr(pipeline, "enhance", boom)
    result = process(photo, no_ml(enhance_provider="openai", output_size=256))
    assert result.meta["enhance"]["used"] is False
    assert result.meta["enhance"]["attempts"][0]["error"] == "provider down"
    assert "cutout.png" in result.assets


def test_colorkey_leaves_no_background_rim():
    # White garment on light grey with a soft edge, like an image-edit result.
    size = 400
    canvas = Image.new("RGB", (size, size), (229, 229, 229))
    canvas.paste((255, 255, 255), (100, 80, 300, 320))
    photo = canvas.filter(ImageFilter.GaussianBlur(1.5))
    rgb = to_float(photo)
    alpha = alpha_colorkey(photo)
    background_coloured = np.linalg.norm(rgb - 229 / 255, axis=2) < 0.01
    # Pixels that are pure background colour must be transparent...
    assert alpha[background_coloured].max() < 0.1
    # ...while the white interior stays solid.
    assert alpha[110:310, 110:290].min() > 0.99
