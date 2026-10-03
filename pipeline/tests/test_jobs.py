import io
import json
import sys
from pathlib import Path

import httpx
import pytest

from hangr_pipeline import PipelineConfig, fidelity, pipeline
from hangr_pipeline.fidelity import Verdict
from hangr_pipeline.jobs import run_job, validate
from hangr_pipeline.store import SupabaseStore

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from make_sample_photo import make_photo  # noqa: E402

USER, ITEM = "user-1", "item-1"


class FakeStore:
    """In-memory stand-in for SupabaseStore."""

    def __init__(self, item: dict, files: dict[str, bytes], assets: dict[str, str] | None = None):
        self.item, self.files, self.assets = item, files, dict(assets or {})

    def get_item(self, item_id):
        assert item_id == self.item["id"]
        return dict(self.item)

    def update_item(self, item_id, **fields):
        self.item.update(fields)

    def get_assets(self, item_id):
        return dict(self.assets)

    def set_assets(self, item_id, paths):
        self.assets = dict(paths)

    def download(self, path):
        return self.files[path]

    def upload(self, path, data, content_type):
        self.files[path] = data

    def remove(self, paths):
        for path in paths:
            self.files.pop(path, None)


def jpeg() -> bytes:
    buf = io.BytesIO()
    make_photo(400).save(buf, format="JPEG")
    return buf.getvalue()


def cfg() -> PipelineConfig:
    return PipelineConfig(enhance_provider="gemini", cutout_method="colorkey", output_size=128)


def item(**fields) -> dict:
    return {"id": ITEM, "user_id": USER, "category": "top", "generation": 1,
            "status": "processing", "meta": None, "review_resolution": None, **fields}


@pytest.fixture
def faithful(monkeypatch):
    monkeypatch.setattr(pipeline, "enhance", lambda image, cfg, feedback=None: image.copy())
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: Verdict(9, []))


def test_process_job_writes_assets_and_meta(faithful):
    store = FakeStore(item(), {f"{USER}/{ITEM}/upload": jpeg()})
    run_job({"type": "process", "item_id": ITEM}, cfg(), store)

    assert store.item["status"] == "ready" and store.item["error"] is None
    assert store.item["meta"]["enhance"]["category"] == "top"
    assert set(store.assets) == {"original.webp", "enhanced.webp", "cutout.png", "thumb.webp"}
    assert all(p.startswith(f"{USER}/{ITEM}/g1/") for p in store.assets.values())
    assert f"{USER}/{ITEM}/upload" not in store.files  # raw upload cleaned up


def test_regenerate_job_replaces_old_generation(monkeypatch):
    feedback = []
    monkeypatch.setattr(pipeline, "enhance",
                        lambda image, cfg, fb=None: feedback.append(fb) or image.copy())
    monkeypatch.setattr(fidelity, "judge_gemini", lambda o, e, cfg: Verdict(8, []))
    old = {k: f"{USER}/{ITEM}/g1/{k}" for k in
           ("original.webp", "cutout.png", "thumb.webp", "photo_cutout.png", "photo_thumb.webp")}
    files = {path: b"old" for path in old.values()}
    original = io.BytesIO()
    make_photo(400).save(original, format="WEBP")
    files[old["original.webp"]] = original.getvalue()
    meta = {"enhance": {"category": "top", "needs_review": True,
                        "attempts": [{"score": 6, "issues": ["fix the text"]}]}}
    store = FakeStore(item(generation=2, meta=meta, review_resolution="kept"), files, old)

    run_job({"type": "regenerate", "item_id": ITEM, "note": "plain sleeves"}, cfg(), store)

    assert feedback == [["plain sleeves", "fix the text"]]
    assert store.item["status"] == "ready" and store.item["review_resolution"] is None
    assert store.item["meta"]["enhance"]["regenerated"] is True
    assert all("/g2/" in p for p in store.assets.values())
    # Passed, so no photo fallback this time, and generation 1 is gone.
    assert "photo_cutout.png" not in store.assets
    assert not any("/g1/" in p for p in store.files)


def test_failed_regenerate_keeps_the_previous_image():
    old = {"cutout.png": f"{USER}/{ITEM}/g1/cutout.png"}
    store = FakeStore(item(), {old["cutout.png"]: b"old"}, old)
    # No original.webp asset: the job fails before calling any model.
    run_job({"type": "regenerate", "item_id": ITEM}, cfg(), store)
    assert store.item["status"] == "ready" and store.item["error"]
    assert store.assets == old and store.files == {old["cutout.png"]: b"old"}


def test_failed_process_marks_item_failed_and_keeps_upload(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("worker crashed")

    monkeypatch.setattr("hangr_pipeline.jobs.process", boom)
    store = FakeStore(item(), {f"{USER}/{ITEM}/upload": b"photo"})
    run_job({"type": "process", "item_id": ITEM}, cfg(), store)
    assert store.item["status"] == "failed" and store.item["error"] == "worker crashed"
    assert f"{USER}/{ITEM}/upload" in store.files  # so it can be retried


@pytest.mark.parametrize("job", [None, {}, {"type": "delete", "item_id": "x"},
                                 {"type": "process"}, {"type": "regenerate", "item_id": "x", "note": 5}])
def test_validate_rejects_bad_jobs(job):
    with pytest.raises(ValueError):
        validate(job)


def test_store_sends_service_key_and_upserts():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "GET" and request.url.path == "/rest/v1/items":
            return httpx.Response(200, json=[{"id": ITEM}])
        return httpx.Response(200, json={})

    store = SupabaseStore("http://sb.test/", "service-key",
                          httpx.Client(transport=httpx.MockTransport(handler)))
    assert store.get_item(ITEM) == {"id": ITEM}
    store.upload("u/i/g1/cutout.png", b"png", "image/png")
    store.update_item(ITEM, status="ready")
    store.remove(["u/i/g0/cutout.png"])

    get, upload, patch, delete = seen
    assert get.headers["apikey"] == "service-key"
    assert get.headers["authorization"] == "Bearer service-key"
    assert get.url.params["id"] == f"eq.{ITEM}"
    assert upload.url.path == "/storage/v1/object/items/u/i/g1/cutout.png"
    assert upload.headers["x-upsert"] == "true" and upload.headers["content-type"] == "image/png"
    assert patch.method == "PATCH" and json.loads(patch.content) == {"status": "ready"}
    assert json.loads(delete.content) == {"prefixes": ["u/i/g0/cutout.png"]}


def test_store_raises_on_errors():
    store = SupabaseStore("http://sb.test", "k", httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(403, text="denied"))))
    with pytest.raises(RuntimeError, match="403"):
        store.download("x")
