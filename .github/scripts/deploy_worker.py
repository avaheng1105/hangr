"""Deploy the Modal worker and connect it to Supabase (see deploy-worker.yml).

1. Fetch the project's service_role key and make a fresh worker token.
2. Store them, and GEMINI_API_KEY, as Modal secrets.
3. `modal deploy pipeline/modal_app.py` and read the `jobs` endpoint URL.
4. Give the Edge Function the endpoint URL and the same token.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import urllib.request

REQUIRED = ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "SUPABASE_ACCESS_TOKEN",
            "SUPABASE_PROJECT_REF", "GEMINI_API_KEY"]


def mask(value: str) -> str:
    print(f"::add-mask::{value}", flush=True)
    return value


def supabase_api(method: str, path: str, body=None):
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{os.environ['SUPABASE_PROJECT_REF']}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
                 "Content-Type": "application/json", "User-Agent": "hangr-deploy"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode()
        return json.loads(text) if text else None


def modal(*args: str) -> str:
    result = subprocess.run(["modal", *args], cwd="pipeline", capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"modal {args[0]} failed:\n{result.stdout}\n{result.stderr}")
    return result.stdout


def main() -> None:
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        print(f"::warning::Not deploying: missing repository secrets {', '.join(missing)}")
        return

    ref = os.environ["SUPABASE_PROJECT_REF"]
    keys = supabase_api("GET", "/api-keys?reveal=true")
    service_key = mask(next(k["api_key"] for k in keys if k["name"] == "service_role"))
    token = mask(secrets.token_hex(32))

    modal("secret", "create", "--force", "hangr-ai-keys",
          f"GEMINI_API_KEY={os.environ['GEMINI_API_KEY']}")
    modal("secret", "create", "--force", "hangr-backend",
          f"SUPABASE_URL=https://{ref}.supabase.co",
          f"SUPABASE_SERVICE_ROLE_KEY={service_key}",
          f"HANGR_WORKER_TOKEN={token}")
    output = modal("deploy", "modal_app.py")
    print(output)
    match = re.search(r"https://\S+?jobs\S*?\.modal\.run", output)
    if not match:
        sys.exit("couldn't find the jobs endpoint URL in the deploy output")

    supabase_api("POST", "/secrets", [
        {"name": "HANGR_WORKER_URL", "value": match.group(0)},
        {"name": "HANGR_WORKER_TOKEN", "value": token},
    ])
    print(f"Deployed. The jobs function now calls {match.group(0)}")


if __name__ == "__main__":
    main()
