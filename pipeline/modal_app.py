"""GPU worker on Modal.

Runs the full pipeline with the BiRefNet background-removal model. The model
weights are baked into the container image at build time, so a cold start
only has to load them onto the GPU.

One-time setup:
    pip install modal && modal setup
    modal secret create hangr-ai-keys OPENAI_API_KEY=... GEMINI_API_KEY=...
    modal secret create hangr-backend SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
        HANGR_WORKER_TOKEN=...   # the same token as the Edge Function's

Try it on a photo (outputs land in ./out):
    modal run modal_app.py --photo samples/tshirt.jpg --enhance openai --category top

Deploy (prints the `jobs` endpoint URL, which the Edge Function calls):
    modal deploy modal_app.py
"""

from __future__ import annotations

import hmac
import os
from dataclasses import replace
from pathlib import Path

import modal

MODELS_DIR = "/models"
HERE = Path(__file__).parent

app = modal.App("hangr-pipeline")


def _download_models() -> None:
    from hangr_pipeline import PipelineConfig, load_models

    load_models(PipelineConfig(cutout_method="model"))


image = (
    # CUDA + cuDNN runtime, needed by onnxruntime-gpu (used by rembg).
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .pip_install_from_requirements(str(HERE / "requirements-gpu.txt"))
    .env({"U2NET_HOME": f"{MODELS_DIR}/rembg"})
    .add_local_python_source("hangr_pipeline", copy=True)
    .run_function(_download_models)
)


# Set HANGR_GPU (e.g. "L4") when deploying to run background removal on a GPU
# (about a second per image; Modal needs a payment method for GPUs). Without
# it the worker runs on CPU, where BiRefNet takes 1-2 minutes per image.
GPU = os.environ.get("HANGR_GPU") or None


@app.cls(
    image=image,
    gpu=GPU,
    cpu=None if GPU else 2.0,
    memory=None if GPU else 6144,
    secrets=[modal.Secret.from_name("hangr-ai-keys"), modal.Secret.from_name("hangr-backend")],
    scaledown_window=120,  # stay warm 2 min after the last item
    # Worst case on CPU: two enhance attempts, each with a cutout, plus the
    # photo cutout for a flagged item.
    timeout=300 if GPU else 900,
)
class Pipeline:
    @modal.enter()
    def load(self) -> None:
        from hangr_pipeline import PipelineConfig, load_models

        self.cfg = PipelineConfig(cutout_method="model")
        # On CPU, BiRefNet is only needed for flagged items (the photo
        # cutout), so it loads on first use rather than slowing every start.
        if GPU:
            load_models(self.cfg)

    @modal.method()
    def process(self, photo: bytes, enhance_provider: str = "none", category: str = "auto") -> dict:
        from hangr_pipeline import process

        cfg = replace(self.cfg, enhance_provider=enhance_provider, category=category)
        result = process(photo, cfg)
        return {"assets": result.assets, "meta": result.meta}

    @modal.method()
    def run_job(self, job: dict) -> None:
        """A job from the backend: process a new photo or regenerate an item."""
        from hangr_pipeline.jobs import run_job
        from hangr_pipeline.store import SupabaseStore

        cfg = replace(self.cfg, enhance_provider="gemini")
        run_job(job, cfg, SupabaseStore.from_env())


web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]")


with web_image.imports():
    from fastapi import HTTPException, Request


@app.function(image=web_image, secrets=[modal.Secret.from_name("hangr-backend")])
@modal.fastapi_endpoint(method="POST")
async def jobs(request: Request) -> dict:
    """Called by the `jobs` Edge Function with a shared token. Queues the job
    and returns at once; the worker writes the result to Supabase."""
    expected = f"Bearer {os.environ['HANGR_WORKER_TOKEN']}"
    authorization = request.headers.get("authorization", "")
    if not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401)
    try:
        job = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="bad json")
    # Same checks as hangr_pipeline.jobs.validate, which this light image can't import.
    if (not isinstance(job, dict) or job.get("type") not in ("process", "regenerate")
            or not isinstance(job.get("item_id"), str)):
        raise HTTPException(status_code=400, detail="bad job")
    if job.get("note") is not None and not isinstance(job["note"], str):
        raise HTTPException(status_code=400, detail="bad note")
    await Pipeline().run_job.spawn.aio(job)
    return {"queued": True}


@app.local_entrypoint()
def main(photo: str, out: str = "out", enhance: str = "none", category: str = "auto") -> None:
    import json

    from hangr_pipeline.__main__ import write_result

    result = Pipeline().process.remote(Path(photo).read_bytes(), enhance, category)
    write_result(result["assets"], result["meta"], Path(out))
    print(json.dumps(result["meta"], indent=2))
    print(f"wrote {len(result['assets']) + 1} files to {out}/")
