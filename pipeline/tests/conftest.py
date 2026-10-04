import pytest

from hangr_pipeline import fidelity


@pytest.fixture(autouse=True)
def no_style_call(monkeypatch):
    """Tests that fake the judge get a passing style check, not a Gemini call."""
    monkeypatch.setattr(fidelity, "check_style", lambda enhanced, cfg: [])
