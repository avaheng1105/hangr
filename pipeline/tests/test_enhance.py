"""Provider calls, with the SDK clients replaced by fakes (no network)."""

import base64
from types import SimpleNamespace

import pytest
from PIL import Image

from hangr_pipeline import PipelineConfig
from hangr_pipeline.enhance import EnhanceError, enhance
from hangr_pipeline.imageio import from_bytes, to_png_bytes
from hangr_pipeline.prompts import build_prompt

INPUT = Image.new("RGB", (3000, 2000), (200, 30, 30))
OUTPUT = Image.new("RGB", (64, 64), (10, 200, 10))


class FakeOpenAI:
    calls: list = []
    returns = OUTPUT

    def __init__(self):
        self.images = self

    def edit(self, **kwargs):
        FakeOpenAI.calls.append(kwargs)
        if self.returns is None:
            return SimpleNamespace(data=[])
        b64 = base64.b64encode(to_png_bytes(self.returns)).decode()
        return SimpleNamespace(data=[SimpleNamespace(b64_json=b64)])


@pytest.fixture
def fake_openai(monkeypatch):
    import openai

    FakeOpenAI.calls = []
    FakeOpenAI.returns = OUTPUT
    monkeypatch.setattr(openai, "OpenAI", FakeOpenAI)
    return FakeOpenAI


def test_openai_edit(fake_openai):
    cfg = PipelineConfig(enhance_provider="openai", openai_model="test-model", category="shoes")
    out = enhance(INPUT, cfg)
    assert out.size == (64, 64) and out.getpixel((0, 0))[:3] == (10, 200, 10)

    call = fake_openai.calls[0]
    assert call["model"] == "test-model"
    assert call["prompt"] == build_prompt("shoes")
    name, data, mime = call["image"]
    assert mime == "image/png"
    # Large photos are downscaled before upload.
    assert max(from_bytes(data).size) == 1536


def test_openai_empty_response_raises(fake_openai):
    fake_openai.returns = None
    with pytest.raises(EnhanceError):
        enhance(INPUT, PipelineConfig(enhance_provider="openai"))


def test_gemini_generate_content(monkeypatch):
    from google import genai

    calls = []

    class FakeModels:
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            text = SimpleNamespace(inline_data=None)
            image = SimpleNamespace(
                inline_data=SimpleNamespace(data=to_png_bytes(OUTPUT), mime_type="image/png")
            )
            content = SimpleNamespace(parts=[text, image])
            return SimpleNamespace(candidates=[SimpleNamespace(content=content)])

    class FakeClient:
        def __init__(self):
            self.models = FakeModels()

    monkeypatch.setattr(genai, "Client", FakeClient)
    cfg = PipelineConfig(enhance_provider="gemini", gemini_model="test-gemini")
    out = enhance(INPUT, cfg)
    assert out.getpixel((0, 0))[:3] == (10, 200, 10)
    assert calls[0]["model"] == "test-gemini"
    assert calls[0]["config"].response_modalities == ["IMAGE"]


def test_gemini_judge_parses_structured_verdict(monkeypatch):
    from google import genai

    from hangr_pipeline.fidelity import judge_gemini

    calls = []

    class FakeModels:
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            schema = kwargs["config"].response_schema
            return SimpleNamespace(parsed=schema(score=12, issues=["legs should flare"]), text="")

    class FakeClient:
        def __init__(self):
            self.models = FakeModels()

    monkeypatch.setattr(genai, "Client", FakeClient)
    verdict = judge_gemini(INPUT, OUTPUT, PipelineConfig(judge_model="test-judge"))
    assert verdict.score == 10  # clamped to 1-10
    assert verdict.issues == ["legs should flare"]
    assert calls[0]["model"] == "test-judge"
    assert len(calls[0]["contents"]) == 3  # original, enhanced, instructions


def _flaky_judge(monkeypatch, failures):
    """A fake genai client whose judge call raises each of `failures` first."""
    from google import genai

    calls = []
    pending = list(failures)

    class FakeModels:
        def generate_content(self, **kwargs):
            calls.append(kwargs)
            if pending:
                raise pending.pop(0)
            schema = kwargs["config"].response_schema
            return SimpleNamespace(parsed=schema(score=8, issues=[]), text="")

    class FakeClient:
        def __init__(self):
            self.models = FakeModels()

    monkeypatch.setattr(genai, "Client", FakeClient)
    return calls


def test_judge_retries_transient_errors(monkeypatch):
    from google.genai import errors

    from hangr_pipeline.fidelity import judge_gemini

    unavailable = errors.ServerError(503, {"error": {"message": "overloaded"}})
    calls = _flaky_judge(monkeypatch, [unavailable, unavailable])
    cfg = PipelineConfig(judge_retries=2, judge_retry_delay=0)
    assert judge_gemini(INPUT, OUTPUT, cfg).score == 8
    assert len(calls) == 3


def test_judge_gives_up_after_its_retries(monkeypatch):
    from google.genai import errors

    from hangr_pipeline.fidelity import judge_gemini

    unavailable = errors.ServerError(503, {"error": {"message": "overloaded"}})
    calls = _flaky_judge(monkeypatch, [unavailable] * 5)
    with pytest.raises(errors.ServerError):
        judge_gemini(INPUT, OUTPUT, PipelineConfig(judge_retries=2, judge_retry_delay=0))
    assert len(calls) == 3


def test_judge_does_not_retry_permanent_errors(monkeypatch):
    from google.genai import errors

    from hangr_pipeline.fidelity import judge_gemini

    bad_key = errors.ClientError(403, {"error": {"message": "permission denied"}})
    calls = _flaky_judge(monkeypatch, [bad_key])
    with pytest.raises(errors.ClientError):
        judge_gemini(INPUT, OUTPUT, PipelineConfig(judge_retry_delay=0))
    assert len(calls) == 1


def test_background_contrasts_with_the_item():
    from hangr_pipeline.enhance import pick_background
    from hangr_pipeline.prompts import DARK_BACKGROUND, LIGHT_BACKGROUND

    white_shirt = Image.new("RGB", (300, 300), (190, 180, 160))  # beige floor
    white_shirt.paste((250, 250, 250), (60, 60, 240, 240))
    navy_jeans = Image.new("RGB", (300, 300), (190, 180, 160))
    navy_jeans.paste((40, 60, 110), (60, 60, 240, 240))
    assert pick_background(white_shirt) == DARK_BACKGROUND
    assert pick_background(navy_jeans) == LIGHT_BACKGROUND


class FakeBFL:
    """httpx.Client stand-in: one job that is pending once, then ready."""

    requests: list = []
    statuses: list = []

    def __init__(self, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def _response(self, json=None, content=b""):
        return SimpleNamespace(json=lambda: json, content=content, raise_for_status=lambda: None)

    def post(self, url, headers, json):
        FakeBFL.requests.append(("POST", url, headers, json))
        return self._response({"id": "job1", "polling_url": "https://poll/job1"})

    def get(self, url, headers=None):
        FakeBFL.requests.append(("GET", url, headers, None))
        if url == "https://poll/job1":
            return self._response(FakeBFL.statuses.pop(0))
        return self._response(content=to_png_bytes(OUTPUT))


@pytest.fixture
def fake_bfl(monkeypatch):
    import httpx

    from hangr_pipeline import enhance as enhance_mod

    FakeBFL.requests = []
    FakeBFL.statuses = [
        {"status": "Pending"},
        {"status": "Ready", "result": {"sample": "https://delivery/img.png"}},
    ]
    monkeypatch.setattr(httpx, "Client", FakeBFL)
    monkeypatch.setattr(enhance_mod, "_BFL_POLL_SECONDS", 0)
    monkeypatch.setenv("BFL_API_KEY", "test-key")
    return FakeBFL


def test_bfl_edit_polls_until_ready(fake_bfl):
    cfg = PipelineConfig(enhance_provider="bfl", bfl_model="flux-test", category="top")
    out = enhance(INPUT, cfg)
    assert out.getpixel((0, 0))[:3] == (10, 200, 10)

    method, url, headers, body = fake_bfl.requests[0]
    assert (method, url) == ("POST", "https://api.bfl.ai/v1/flux-test")
    assert headers["x-key"] == "test-key"
    assert body["prompt"] == build_prompt("top")
    assert max(from_bytes(base64.b64decode(body["input_image"])).size) == 1536
    assert [r[1] for r in fake_bfl.requests[1:]] == [
        "https://poll/job1", "https://poll/job1", "https://delivery/img.png"
    ]


def test_bfl_failed_job_raises(fake_bfl):
    fake_bfl.statuses = [{"status": "Content Moderated"}]
    with pytest.raises(EnhanceError):
        enhance(INPUT, PipelineConfig(enhance_provider="bfl"))
