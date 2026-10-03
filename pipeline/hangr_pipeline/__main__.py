"""Run the pipeline on a local photo.

    python -m hangr_pipeline photo.jpg -o out/
    python -m hangr_pipeline photo.jpg -o out/ --enhance openai --category top
    python -m hangr_pipeline photo.jpg -o out/ --cutout colorkey   # no ML

Regenerate an item flagged for review, with a note for the image model:
    python -m hangr_pipeline out/original.webp -o out2/ --enhance gemini \
        --previous out/meta.json --note "plain short sleeves"
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from .config import PipelineConfig
from .pipeline import process, regenerate
from .prompts import CATEGORIES


def main() -> None:
    parser = argparse.ArgumentParser(prog="hangr_pipeline", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photo", type=Path)
    parser.add_argument("-o", "--out", type=Path, default=Path("out"))
    parser.add_argument("--enhance", choices=["none", "openai", "gemini", "bfl"])
    parser.add_argument("--category", choices=CATEGORIES, default="auto",
                        help="item type, picks the enhance styling (default: auto)")
    parser.add_argument("--cutout", choices=["model", "colorkey"])
    parser.add_argument("--note", help="regenerate: what the image model should fix")
    parser.add_argument("--previous", type=Path, metavar="META",
                        help="regenerate: the item's meta.json (its category and judge issues)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    cfg = PipelineConfig(category=args.category)
    if args.enhance:
        cfg.enhance_provider = args.enhance
    if args.cutout:
        cfg.cutout_method = args.cutout

    photo = args.photo.read_bytes()
    if args.note or args.previous:
        previous = json.loads(args.previous.read_text()) if args.previous else None
        result = regenerate(photo, previous, args.note, cfg)
    else:
        result = process(photo, cfg)
    write_result(result.assets, result.meta, args.out)
    print(json.dumps(result.meta, indent=2))
    print(f"wrote {len(result.assets) + 1} files to {args.out}/")


def write_result(assets: dict[str, bytes], meta: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for name, data in assets.items():
        (out / name).write_bytes(data)
    (out / "meta.json").write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
