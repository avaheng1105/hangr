import pytest
from PIL import Image

from hangr_pipeline import PipelineConfig, process
from hangr_pipeline.prompts import CATEGORIES, DARK_BACKGROUND, build_prompt


@pytest.mark.parametrize("category", CATEGORIES)
def test_every_category_keeps_the_item_unchanged(category):
    prompt = build_prompt(category)
    assert "Keep the item EXACTLY the same" in prompt
    assert "#EEEEEE" in prompt
    assert "#3A3A3A" in build_prompt(category, background=DARK_BACKGROUND)


@pytest.mark.parametrize("category", ["top", "outerwear", "dress", "bottom", "skirt"])
def test_clothes_use_ghost_mannequin(category):
    assert "ghost mannequin" in build_prompt(category)


def test_non_clothing_is_not_put_on_a_mannequin():
    for category in ["shoes", "bag", "jewelry", "accessory"]:
        assert "mannequin" not in build_prompt(category).split("- Soft, even")[0]
    assert "pair side by side" in build_prompt("shoes")


def test_auto_covers_every_kind_of_item():
    prompt = build_prompt("auto")
    for word in ["ghost mannequin", "Shoes", "Bags", "Jewellery"]:
        assert word in prompt


def test_unknown_category_fails_fast():
    with pytest.raises(ValueError, match="unknown category"):
        build_prompt("hat")
    cfg = PipelineConfig(enhance_provider="openai", cutout_method="colorkey",
                         category="hat")
    with pytest.raises(ValueError, match="unknown category"):
        process(Image.new("RGB", (64, 64), "white"), cfg)


def test_feedback_is_appended_for_retries():
    prompt = build_prompt("bottom", ["the legs should flare out from the knee"])
    assert prompt.startswith(build_prompt("bottom"))
    assert "- the legs should flare out from the knee" in prompt
    assert build_prompt("bottom", []) == build_prompt("bottom")


def test_auto_prompt_carries_every_category_styling():
    from hangr_pipeline.prompts import _STYLES

    prompt = build_prompt("auto")
    for styling in _STYLES.values():
        assert styling in prompt
    assert "never a flat lay" in prompt
