"""A local stand-in for the Modal `jobs` endpoint, for `supabase start` setups.

    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \\
    HANGR_WORKER_TOKEN=dev-token GEMINI_API_KEY=... \\
    python -m hangr_pipeline.worker --port 8787 --cutout colorkey

Point the Edge Function at it with HANGR_WORKER_URL=http://host.docker.internal:8787.
"""

from __future__ import annotations

import argparse
import hmac
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .config import PipelineConfig
from .jobs import run_job, validate
from .store import SupabaseStore


def main() -> None:
    parser = argparse.ArgumentParser(prog="hangr_pipeline.worker")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--cutout", choices=["model", "colorkey"], default="model")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    cfg = PipelineConfig(enhance_provider="gemini", cutout_method=args.cutout)
    store = SupabaseStore.from_env()
    expected = f"Bearer {os.environ['HANGR_WORKER_TOKEN']}".encode()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), expected):
                return self._send(401, {"error": "unauthorized"})
            try:
                length = int(self.headers.get("Content-Length", 0))
                job = validate(json.loads(self.rfile.read(length)))
            except ValueError as exc:
                return self._send(400, {"error": str(exc)})
            threading.Thread(target=run_job, args=(job, cfg, store), daemon=True).start()
            self._send(200, {"queued": True})

        def _send(self, code: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    print(f"worker listening on :{args.port}")
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
