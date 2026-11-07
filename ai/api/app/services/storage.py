"""Private item-photos bucket: signed upload URLs for the browser and signed view URLs for images."""
from __future__ import annotations

from uuid import uuid4

from flask import current_app

from ..db import db

BUCKET = "item-photos"


def signed_upload(path: str) -> dict:
    result = db().storage.from_(BUCKET).create_signed_upload_url(path)
    return {"path": path, "token": result.get("token"), "signed_url": result.get("signed_url") or result.get("signedUrl")}


def new_item_photo_upload(org_id: str) -> dict:
    return signed_upload(f"items/{org_id}/{uuid4().hex}.jpg")


def new_proof_upload(claim_id: str) -> dict:
    return signed_upload(f"proofs/{claim_id}/{uuid4().hex}.jpg")


def signed_urls(paths: list[str]) -> dict[str, str]:
    """Map each storage path to a signed view URL (1 hour). Missing files are simply left out."""
    unique = [p for p in dict.fromkeys(paths) if p]
    if not unique:
        return {}
    try:
        rows = db().storage.from_(BUCKET).create_signed_urls(unique, current_app.config.get("IMAGE_URL_TTL", 3600))
    except Exception as exc:  # noqa: BLE001
        current_app.logger.warning("signed_urls failed: %s", exc)
        return {}
    out: dict[str, str] = {}
    for row in rows or []:
        url = row.get("signedURL") or row.get("signedUrl") or row.get("signed_url")
        if url and not row.get("error"):
            out[row.get("path")] = url if url.startswith("http") else f"{current_app.config['SUPABASE_URL']}/storage/v1{url}"
    return out


def object_exists(path: str) -> bool:
    folder, _, name = path.rpartition("/")
    try:
        return any(f.get("name") == name for f in db().storage.from_(BUCKET).list(folder, {"search": name}))
    except Exception:  # noqa: BLE001
        return False
