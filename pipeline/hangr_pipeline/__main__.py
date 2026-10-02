"""Run the pipeline on a local photo.

    python -m hangr_pipeline photo.jpg -o out/
    python -m hangr_pipeline photo.jpg -o out/ --enhance openai
    python -m hangr_pipeline photo.jpg -o out/ --cutout colorkey --depth inflate   # no ML
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from .config import PipelineConfig
from .pipeline import process


def main() -> None:
    parser = argparse.ArgumentParser(prog="hangr_pipeline", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photo", type=Path)
    parser.add_argument("-o", "--out", type=Path, default=Path("out"))
    parser.add_argument("--enhance", choices=["none", "openai", "gemini"])
    parser.add_argument("--cutout", choices=["model", "colorkey"])
    parser.add_argument("--depth", choices=["model", "inflate"])
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    cfg = PipelineConfig()
    if args.enhance:
        cfg.enhance_provider = args.enhance
    if args.cutout:
        cfg.cutout_method = args.cutout
    if args.depth:
        cfg.depth_method = args.depth

    result = process(args.photo.read_bytes(), cfg)
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
