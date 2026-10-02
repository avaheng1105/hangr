"""Provider calls, with the SDK clients replaced by fakes (no network)."""

import base64
from types import SimpleNamespace

import pytest
from PIL import Image

from hangr_pipeline import PipelineConfig
from hangr_pipeline.enhance import EnhanceError, enhance
from hangr_pipeline.imageio import from_bytes, to_png_bytes

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
    cfg = PipelineConfig(enhance_provider="openai", openai_model="test-model")
    out = enhance(INPUT, cfg)
    assert out.size == (64, 64) and out.getpixel((0, 0))[:3] == (10, 200, 10)

    call = fake_openai.calls[0]
    assert call["model"] == "test-model"
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
