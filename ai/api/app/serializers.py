"""Row → response shapes. These match web/src/shared/api/types.ts exactly.
Public serializers use explicit allow-lists and never touch item_secrets."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .db import db
from .services.storage import signed_urls

PUBLIC_STATUSES = ["available", "claim_pending"]
OPEN_CLAIM = ["submitted", "under_review"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def distance_km(lat1, lng1, lat2, lng2) -> float | None:
    if None in (lat1, lng1, lat2, lng2):
        return None
    r = math.radians
    a = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def images_by_item(item_ids: list[str]) -> dict[str, list[dict]]:
    """item_id → [{id, path, url, thumb_url}] ordered by position, with signed URLs."""
    if not item_ids:
        return {}
    rows = db().table("item_images").select("id,item_id,path,position,is_cover").in_("item_id", item_ids).order("position").execute().data or []
    urls = signed_urls([r["path"] for r in rows])
    out: dict[str, list[dict]] = {}
    for r in rows:
        url = urls.get(r["path"])
        if url:
            out.setdefault(r["item_id"], []).append({"id": r["id"], "url": url, "thumb_url": url, "is_cover": r["is_cover"]})
    for imgs in out.values():
        imgs.sort(key=lambda i: not i["is_cover"])  # cover first, then by position
    return out


def locations_by_id(ids: list[str]) -> dict[str, dict]:
    ids = [i for i in dict.fromkeys(ids) if i]
    if not ids:
        return {}
    rows = db().table("locations").select("id,org_id,name,address,lat,lng,desk_hours").in_("id", ids).execute().data or []
    return {r["id"]: r for r in rows}


def requested_items(user_id: str | None, item_ids: list[str]) -> set[str]:
    if not user_id or not item_ids:
        return set()
    rows = db().table("claims").select("item_id").eq("claimant_id", user_id).eq("chat_done", True).in_("item_id", item_ids).execute().data or []
    return {r["item_id"] for r in rows}


def item_cards(items: list[dict], user_id: str | None = None) -> list[dict]:
    ids = [i["id"] for i in items]
    imgs = images_by_item(ids)
    locs = locations_by_id([i["location_id"] for i in items])
    mine = requested_items(user_id, ids)
    out = []
    for i in items:
        cover = (imgs.get(i["id"]) or [None])[0]
        loc = locs.get(i["location_id"], {})
        out.append({
            "id": i["id"], "title": i["title"], "status": i["status"], "found_at": i["found_at"],
            "location": {"id": i["location_id"], "name": loc.get("name", "")},
            "cover_url": cover["url"] if cover else None, "thumb_url": cover["thumb_url"] if cover else None,
            "requested": i["id"] in mine,
        })
    return out


def public_image_refs(item_id: str) -> list[dict]:
    return [{"id": i["id"], "url": i["url"], "thumb_url": i["thumb_url"]} for i in images_by_item([item_id]).get(item_id, [])]


def place(loc: dict, counts: dict[str, int], lat=None, lng=None) -> dict:
    return {
        "id": loc["id"], "name": loc["name"], "address": loc.get("address") or "", "lat": loc.get("lat"), "lng": loc.get("lng"),
        "desk_hours": loc.get("desk_hours") or "", "distance_km": distance_km(lat, lng, loc.get("lat"), loc.get("lng")),
        "available_count": counts.get(loc["id"], 0),
    }


def available_counts(location_ids: list[str] | None = None) -> dict[str, int]:
    q = db().table("items").select("location_id").in_("status", PUBLIC_STATUSES)
    if location_ids is not None:
        if not location_ids:
            return {}
        q = q.in_("location_id", location_ids)
    counts: dict[str, int] = {}
    for r in q.execute().data or []:
        counts[r["location_id"]] = counts.get(r["location_id"], 0) + 1
    return counts


def profile_out(row: dict | None) -> dict | None:
    if not row or row.get("deleted_at"):
        return None
    return {k: row.get(k) for k in ("full_name", "phone_e164")} | {
        "phone_verified": bool(row.get("phone_verified")), "notify_push": bool(row.get("notify_push")), "use_location": bool(row.get("use_location")),
    }


def profiles_by_user(user_ids: list[str]) -> dict[str, dict]:
    ids = [u for u in dict.fromkeys(user_ids) if u]
    if not ids:
        return {}
    rows = db().table("profiles").select("user_id,full_name,phone_e164,deleted_at").in_("user_id", ids).execute().data or []
    return {r["user_id"]: r for r in rows}


def claimant_out(profile: dict | None) -> dict:
    if not profile or profile.get("deleted_at"):
        return {"name": "Deleted account", "phone_last4": None}
    phone = profile.get("phone_e164") or ""
    return {"name": profile.get("full_name") or "Unknown", "phone_last4": phone[-4:] if phone else None}
