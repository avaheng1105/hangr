"""Read and write items in Supabase (Postgres via PostgREST, plus Storage).

The worker runs with the service role key, so it bypasses row-level
security: it must only touch the item named in the job it was given.
Schema: supabase/migrations/.
"""

from __future__ import annotations

import os

import httpx

BUCKET = "items"


class SupabaseStore:
    def __init__(self, url: str, service_key: str, client: httpx.Client | None = None):
        self.url = url.rstrip("/")
        headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self.http = client or httpx.Client(timeout=60)
        self.http.headers.update(headers)

    @classmethod
    def from_env(cls) -> "SupabaseStore":
        return cls(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    def _check(self, response: httpx.Response) -> httpx.Response:
        if response.is_error:
            raise RuntimeError(f"Supabase {response.request.method} {response.request.url.path}"
                               f" failed: {response.status_code} {response.text[:300]}")
        return response

    # -- Postgres ---------------------------------------------------------

    def get_item(self, item_id: str) -> dict:
        response = self._check(self.http.get(
            f"{self.url}/rest/v1/items",
            params={"id": f"eq.{item_id}", "select": "*"},
        ))
        rows = response.json()
        if not rows:
            raise LookupError(f"item {item_id} not found")
        return rows[0]

    def update_item(self, item_id: str, **fields) -> None:
        self._check(self.http.patch(
            f"{self.url}/rest/v1/items", params={"id": f"eq.{item_id}"}, json=fields,
        ))

    def fill_category(self, item_id: str, category: str) -> None:
        """Set the item's category, unless the user already picked one."""
        self._check(self.http.patch(
            f"{self.url}/rest/v1/items",
            params={"id": f"eq.{item_id}", "category": "eq.auto"},
            json={"category": category},
        ))

    def fill_subcategory(self, item_id: str, subcategory: str, category: str) -> None:
        """Set the item's subcategory, unless the user already picked one or
        changed the item to another category."""
        self._check(self.http.patch(
            f"{self.url}/rest/v1/items",
            params={"id": f"eq.{item_id}", "subcategory": "is.null", "category": f"eq.{category}"},
            json={"subcategory": subcategory},
        ))

    def get_assets(self, item_id: str) -> dict[str, str]:
        """Asset file name (kind) -> Storage path."""
        response = self._check(self.http.get(
            f"{self.url}/rest/v1/item_assets",
            params={"item_id": f"eq.{item_id}", "select": "kind,path"},
        ))
        return {row["kind"]: row["path"] for row in response.json()}

    def set_assets(self, item_id: str, paths: dict[str, str]) -> None:
        """Replace the item's asset rows with `paths` (kind -> Storage path)."""
        self._check(self.http.delete(
            f"{self.url}/rest/v1/item_assets", params={"item_id": f"eq.{item_id}"},
        ))
        rows = [{"item_id": item_id, "kind": kind, "path": path} for kind, path in paths.items()]
        self._check(self.http.post(f"{self.url}/rest/v1/item_assets", json=rows))

    # -- Storage ----------------------------------------------------------

    def download(self, path: str) -> bytes:
        return self._check(self.http.get(f"{self.url}/storage/v1/object/{BUCKET}/{path}")).content

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        self._check(self.http.post(
            f"{self.url}/storage/v1/object/{BUCKET}/{path}",
            content=data,
            headers={"Content-Type": content_type, "x-upsert": "true"},
        ))

    def remove(self, paths: list[str]) -> None:
        if paths:
            self._check(self.http.request(
                "DELETE", f"{self.url}/storage/v1/object/{BUCKET}", json={"prefixes": paths},
            ))
