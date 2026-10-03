import io
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageFilter

from hangr_pipeline import PipelineConfig, fidelity, pipeline, process
from hangr_pipeline.fidelity import Verdict
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
    monkeypatch.setattr(pipeline, "enhance", lambda image, cfg, feedback=None: image.copy())
    result = process(photo, no_ml(enhance_provider="openai", output_size=256))
    assert result.meta["enhance"]["used"] is True
    assert len(result.meta["enhance"]["attempts"]) == 1
    assert "enhanced.webp" in result.assets


def test_falls_back_to_original_when_enhance_changes_colours(photo, monkeypatch):
    def recolour(image, cfg, feedback=None):
        return Image.fromarray(np.asarray(image)[..., [2, 0, 1]])

    monkeypatch.setattr(pipeline, "enhance", recolour)
    cfg = no_ml(enhance_provider="gemini", fidelity_method="colour", output_size=256)
    result = process(photo, cfg)
    meta = result.meta["enhance"]
    assert meta["used"] is False
    assert len(meta["attempts"]) == 2  # first try + one retry
    assert all(a["fidelity"] < 0.55 for a in meta["attempts"])


def test_falls_back_to_original_when_enhance_errors(photo, monkeypatch):
    def boom(image, cfg, feedback=None):
        raise RuntimeError("provider down")

    monkeypatch.setattr(pipeline, "enhance", boom)
    result = process(photo, no_ml(enhance_provider="openai", output_size=256))
    assert result.meta["enhance"]["used"] is False
    assert result.meta["enhance"]["attempts"][0]["error"] == "provider down"
    assert "cutout.png" in result.assets


def test_judge_feedback_is_passed_to_the_retry(photo, monkeypatch):
    calls = []

    def fake_enhance(image, cfg, feedback=None):
        calls.append(feedback)
        return image.copy()

    verdicts = iter([Verdict(4, ["the legs should flare out"]), Verdict(9, [])])
    monkeypatch.setattr(pipeline, "enhance", fake_enhance)
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: next(verdicts))
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))

    meta = result.meta["enhance"]
    assert meta["fidelity_method"] == "gemini" and meta["used"] is True
    assert calls == [None, ["the legs should flare out"]]
    assert [a["score"] for a in meta["attempts"]] == [4, 9]


def test_judge_rejections_fall_back_to_original(photo, monkeypatch):
    monkeypatch.setattr(pipeline, "enhance", lambda image, cfg, feedback=None: image.copy())
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: Verdict(3, ["wrong print"]))
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))
    assert result.meta["enhance"]["used"] is False
    assert "needs_review" not in result.meta["enhance"]
    assert len(result.meta["enhance"]["attempts"]) == 2


def test_near_miss_keeps_best_attempt_for_review(photo, monkeypatch):
    shades = iter([(255, 0, 0), (0, 0, 255)])

    def fake_enhance(image, cfg, feedback=None):
        tinted = image.copy()
        tinted.paste(next(shades), (0, 0, 8, 8))  # mark which attempt this is
        return tinted

    verdicts = iter([Verdict(6, ["a"]), Verdict(5, ["b"])])
    monkeypatch.setattr(pipeline, "enhance", fake_enhance)
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: next(verdicts))
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))

    meta = result.meta["enhance"]
    assert meta["used"] is True and meta["needs_review"] is True
    assert meta["review_reason"] == "low_score"
    # The kept image is the first (higher-scoring) attempt.
    kept = Image.open(io.BytesIO(result.assets["enhanced.webp"])).convert("RGB")
    r, g, b = kept.getpixel((2, 2))
    assert r > 200 and b < 60


def test_judge_error_flags_the_image_for_review(photo, monkeypatch):
    enhance_calls = []

    def fake_enhance(image, cfg, feedback=None):
        enhance_calls.append(feedback)
        return image.copy()

    def judge_down(o, e, cfg):
        raise RuntimeError("503 UNAVAILABLE")

    monkeypatch.setattr(pipeline, "enhance", fake_enhance)
    monkeypatch.setattr(fidelity, "judge_gemini", judge_down)
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))

    meta = result.meta["enhance"]
    # Kept for the user to look at, never accepted unchecked.
    assert meta["used"] is True and meta["needs_review"] is True
    assert meta["review_reason"] == "judge_failed"
    assert meta["attempts"][0]["judge_error"] == "503 UNAVAILABLE"
    assert "enhanced.webp" in result.assets
    # No second enhance call that couldn't be judged either.
    assert len(enhance_calls) == 1


def test_judge_error_after_a_near_miss_keeps_the_judged_attempt(photo, monkeypatch):
    shades = iter([(255, 0, 0), (0, 0, 255)])

    def fake_enhance(image, cfg, feedback=None):
        tinted = image.copy()
        tinted.paste(next(shades), (0, 0, 8, 8))
        return tinted

    verdicts = iter([Verdict(6, ["a"])])

    def judge(o, e, cfg):
        for verdict in verdicts:
            return verdict
        raise RuntimeError("judge down")

    monkeypatch.setattr(pipeline, "enhance", fake_enhance)
    monkeypatch.setattr(fidelity, "judge_gemini", judge)
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))

    meta = result.meta["enhance"]
    assert meta["needs_review"] is True and meta["review_reason"] == "low_score"
    kept = Image.open(io.BytesIO(result.assets["enhanced.webp"])).convert("RGB")
    r, g, b = kept.getpixel((2, 2))
    assert r > 200 and b < 60


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


def test_soft_edges_take_the_garment_colour_not_the_background():
    # White square on a dark background, with a soft edge.
    canvas = Image.new("RGB", (400, 400), (58, 58, 58))
    canvas.paste((255, 255, 255), (100, 100, 300, 300))
    photo = canvas.filter(ImageFilter.GaussianBlur(1.5))
    rgb, alpha = frame(photo, alpha_colorkey(photo), no_ml(output_size=256))
    edge = (alpha > 0.05) & (alpha < 0.98)
    assert edge.any()
    assert rgb[edge].min() > 0.9  # white, not grey or dark


def test_flagged_item_also_gets_a_photo_cutout(photo, monkeypatch):
    monkeypatch.setattr(pipeline, "enhance", lambda image, cfg, feedback=None: image.copy())
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: Verdict(6, ["a"]))
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))

    assert result.meta["enhance"]["needs_review"] is True
    assert {"photo_cutout.png", "photo_thumb.webp"} <= set(result.assets)
    cutout = Image.open(io.BytesIO(result.assets["photo_cutout.png"]))
    assert cutout.mode == "RGBA" and cutout.size == (256, 256)


def test_accepted_item_has_no_photo_cutout(photo, monkeypatch):
    monkeypatch.setattr(pipeline, "enhance", lambda image, cfg, feedback=None: image.copy())
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: Verdict(9, []))
    result = process(photo, no_ml(enhance_provider="gemini", output_size=256))
    assert "photo_cutout.png" not in result.assets


def test_regenerate_sends_note_and_previous_issues_once(photo, monkeypatch):
    calls = []

    def fake_enhance(image, cfg, feedback=None):
        calls.append((cfg.category, feedback))
        return image.copy()

    judge_calls = []

    def judge(o, e, cfg):
        judge_calls.append(1)
        return Verdict(6, ["still wrong"])

    monkeypatch.setattr(pipeline, "enhance", fake_enhance)
    monkeypatch.setattr(fidelity, "judge_gemini", judge)
    previous = {"enhance": {"category": "top", "attempts": [
        {"score": 5, "issues": ["older"]},
        {"score": 6, "issues": ["fix the lettering"]},
        {"error": "provider down"},
    ]}}
    result = pipeline.regenerate(
        photo, previous, "  plain\nshort sleeves ", no_ml(enhance_provider="gemini", output_size=256)
    )

    meta = result.meta["enhance"]
    # One enhance call and one judge call, even though it failed again.
    assert calls == [("top", ["plain short sleeves", "fix the lettering"])]
    assert len(judge_calls) == 1
    assert meta["note"] == "plain short sleeves" and meta["regenerated"] is True
    # Judged again, so a near miss is flagged again.
    assert meta["needs_review"] is True and "photo_cutout.png" in result.assets


def test_note_stays_in_the_prompt_on_retries(photo, monkeypatch):
    calls = []

    def fake_enhance(image, cfg, feedback=None):
        calls.append(feedback)
        return image.copy()

    verdicts = iter([Verdict(4, ["the legs should flare out"]), Verdict(9, [])])
    monkeypatch.setattr(pipeline, "enhance", fake_enhance)
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: next(verdicts))
    process(photo, no_ml(enhance_provider="gemini", output_size=256), note="flared")
    assert calls == [["flared"], ["flared", "the legs should flare out"]]


def test_clean_note_trims_and_caps():
    assert pipeline.clean_note(None) is None
    assert pipeline.clean_note("   \n ") is None
    assert pipeline.clean_note("a\n  b") == "a b"
    assert len(pipeline.clean_note("x" * 500)) == pipeline.NOTE_MAX_CHARS
