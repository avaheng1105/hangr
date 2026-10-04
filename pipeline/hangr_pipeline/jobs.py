"""Jobs the backend sends to the worker, run against Supabase.

The `jobs` Edge Function has already checked that the user owns the item,
set its status to "processing" and bumped its generation. A job is:

    {"type": "process", "item_id": "..."}                  new photo at {user}/{item}/upload
    {"type": "regenerate", "item_id": "...", "note": "..."}  re-run from original.webp

Assets go to {user}/{item}/g{generation}/{name}, so a new run never
overwrites files the app may have cached, and the old run's files are
deleted once the item points at the new ones.
"""

from __future__ import annotations

import logging
from dataclasses import replace

from PIL import UnidentifiedImageError

from .config import PipelineConfig
from .pipeline import process, regenerate
from .store import SupabaseStore

log = logging.getLogger(__name__)

JOB_TYPES = ("process", "regenerate")

_CONTENT_TYPES = {".png": "image/png", ".webp": "image/webp"}


def validate(job: object) -> dict:
    """The job if it's well-formed, else ValueError. modal_app.jobs repeats
    these checks, so keep the two in step."""
    if not isinstance(job, dict) or job.get("type") not in JOB_TYPES:
        raise ValueError("job needs a type: process or regenerate")
    if not isinstance(job.get("item_id"), str) or not job["item_id"]:
        raise ValueError("job needs an item_id")
    if job.get("note") is not None and not isinstance(job["note"], str):
        raise ValueError("note must be a string")
    return job


def run_job(job: dict, cfg: PipelineConfig, store: SupabaseStore) -> None:
    item_id = job["item_id"]
    item = store.get_item(item_id)
    prefix = f"{item['user_id']}/{item_id}"
    upload = f"{prefix}/upload"
    old = store.get_assets(item_id)
    try:
        if job["type"] == "process":
            result = process(store.download(upload), replace(cfg, category=item["category"]))
        else:
            original = store.download(old["original.webp"])
            cfg = replace(cfg, category=item["category"])
            result = regenerate(original, item.get("meta"), job.get("note"), cfg)

        paths = {}
        for name, data in result.assets.items():
            path = f"{prefix}/g{item['generation']}/{name}"
            content_type = _CONTENT_TYPES[name[name.rindex("."):]]
            store.upload(path, data, content_type)
            paths[name] = path
        store.set_assets(item_id, paths)
        store.update_item(item_id, status="ready", meta=result.meta,
                          review_resolution=None, error=None)
    except Exception as exc:
        log.exception("job %s failed", job)
        # A failed regenerate leaves the previous image in place.
        status = "failed" if job["type"] == "process" else "ready"
        if isinstance(exc, UnidentifiedImageError):
            message = "The file wasn't a photo the app could read."
        else:
            message = str(exc)[:500]
        store.update_item(item_id, status=status, error=message)
        return
    stale = [p for p in old.values() if p not in paths.values()]
    if job["type"] == "process":
        stale.append(upload)
    try:
        store.remove(stale)
    except Exception:
        log.warning("couldn't delete old files of %s", item_id, exc_info=True)
