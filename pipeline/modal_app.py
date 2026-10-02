"""GPU worker on Modal.

Runs the full pipeline with the ML models (BiRefNet cutout + Depth Anything
depth). Model weights are baked into the container image at build time, so
a cold start only has to load them onto the GPU.

One-time setup:
    pip install modal && modal setup
    modal secret create hangr-ai-keys OPENAI_API_KEY=... GEMINI_API_KEY=...

Try it on a photo (outputs land in ./out):
    modal run modal_app.py --photo samples/tshirt.jpg --enhance openai --category top

Deploy (so the Supabase backend can call it later):
    modal deploy modal_app.py
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import modal

MODELS_DIR = "/models"
HERE = Path(__file__).parent

app = modal.App("hangr-pipeline")


def _download_models() -> None:
    from hangr_pipeline import PipelineConfig, load_models

    load_models(PipelineConfig(cutout_method="model", depth_method="model"))


image = (
    # CUDA + cuDNN runtime, needed by onnxruntime-gpu (used by rembg).
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .pip_install_from_requirements(str(HERE / "requirements-gpu.txt"))
    .env({"HF_HOME": f"{MODELS_DIR}/hf", "U2NET_HOME": f"{MODELS_DIR}/rembg"})
    .add_local_python_source("hangr_pipeline", copy=True)
    .run_function(_download_models)
)


@app.cls(
    image=image,
    gpu="L4",
    secrets=[modal.Secret.from_name("hangr-ai-keys")],
    scaledown_window=120,  # stay warm 2 min after the last item
    timeout=300,
)
class Pipeline:
    @modal.enter()
    def load(self) -> None:
        from hangr_pipeline import PipelineConfig, load_models

        self.cfg = PipelineConfig(cutout_method="model", depth_method="model")
        load_models(self.cfg)

    @modal.method()
    def process(self, photo: bytes, enhance_provider: str = "none", category: str = "auto") -> dict:
        from hangr_pipeline import process

        cfg = replace(self.cfg, enhance_provider=enhance_provider, category=category)
        result = process(photo, cfg)
        return {"assets": result.assets, "meta": result.meta}


@app.local_entrypoint()
def main(photo: str, out: str = "out", enhance: str = "none", category: str = "auto") -> None:
    import json

    from hangr_pipeline.__main__ import write_result

    result = Pipeline().process.remote(Path(photo).read_bytes(), enhance, category)
    write_result(result["assets"], result["meta"], Path(out))
    print(json.dumps(result["meta"], indent=2))
    print(f"wrote {len(result['assets']) + 1} files to {out}/")
