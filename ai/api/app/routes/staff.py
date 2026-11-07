import re
import time
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request

from ..auth import require_staff
from ..db import db
from ..errors import ApiError
from ..serializers import OPEN_CLAIM, PUBLIC_STATUSES, claimant_out, images_by_item, item_cards, locations_by_id, now_iso, profiles_by_user, public_image_refs
from ..services import ai
from ..services.claims import run_scoring, sweep_stuck
from ..services.notify import claim_status_changed
from ..services.security import encrypt_code, hash_code, make_qr_token, pickup_code, verify_qr_token
from ..services.storage import new_item_photo_upload, signed_urls

bp = Blueprint("staff", __name__)

ARCHIVE_REASONS = {"Donated", "Disposed", "Given to police", "Other"}
REJECT_REASONS = {"Details don’t match", "Item already returned", "Suspected false claim", "Other"}
TITLE_MSG = "Give the item a short name, like ‘Black backpack’."
EVENT_NAMES = {"claim.approved": "claim_approved", "pickup.completed": "handed_over", "item.created": "item_created", "item.archived": "item_archived", "claim.rejected": "claim_rejected"}


def _org_item(item_id: str, fields: str = "*") -> dict:
    rows = db().table("items").select(fields).eq("id", item_id).eq("org_id", g.principal.org_id).limit(1).execute().data
    if not rows:
        raise ApiError("Item not found.", "NOT_FOUND", 404)
    return rows[0]


def _org_claim(claim_id: str) -> dict:
    rows = db().table("claims").select("*,items!inner(id,org_id,title)").eq("id", claim_id).eq("items.org_id", g.principal.org_id).limit(1).execute().data
    if not rows:
        raise ApiError("Claim not found.", "NOT_FOUND", 404)
    return rows[0]


def _audit(type_: str, entity_id: str, data: dict | None = None) -> None:
    db().table("audit_events").insert({"org_id": g.principal.org_id, "actor_id": g.principal.user_id, "type": type_, "entity_id": entity_id, "data": data or {}}).execute()


def _own_paths(paths: list[str]) -> bool:
    return all(isinstance(p, str) and p.startswith(f"items/{g.principal.org_id}/") and ".." not in p for p in paths)


def _validate_item(body: dict, partial: bool = False) -> dict:
    """Validation Rules sheet. Returns cleaned values; raises 422 with field messages."""
    fields: dict[str, str] = {}
    out: dict = {}
    if not partial or "title" in body:
        t = str(body.get("title") or "").strip()
        if not (3 <= len(t) <= 60) or not re.search(r"[^\W_]", t):
            fields["title"] = TITLE_MSG
        out["title"] = t
    if "category" in body:
        out["category"] = (str(body.get("category") or "").strip().lower()[:50]) or None
    for key in ("colours", "tags"):
        if key in body:
            vals = [str(v).strip().lower() for v in (body.get(key) or []) if str(v).strip()]
            if key == "tags" and (len(vals) > 8 or any(not (2 <= len(v) <= 24) for v in vals)):
                fields["tags"] = "Tags must be 2 to 24 characters."
            out[key] = list(dict.fromkeys(vals))[:8]
    if not partial or "location_id" in body:
        loc = db().table("locations").select("id").eq("id", body.get("location_id") or "00000000-0000-0000-0000-000000000000").eq("org_id", g.principal.org_id).limit(1).execute().data
        if not loc:
            fields["location_id"] = "Choose where it was found."
        out["location_id"] = body.get("location_id")
    if "exact_spot" in body:
        spot = str(body.get("exact_spot") or "").strip()
        if len(spot) > 80:
            fields["exact_spot"] = "Keep it under 80 characters."
        out["exact_spot"] = spot or None
    if body.get("found_at"):
        try:
            found = datetime.fromisoformat(str(body["found_at"]).replace("Z", "+00:00"))
            found = found if found.tzinfo else found.replace(tzinfo=timezone.utc)
            if found > datetime.now(timezone.utc) + timedelta(minutes=1):
                fields["found_at"] = "Date can’t be in the future."
            out["found_at"] = found.isoformat()
        except ValueError:
            fields["found_at"] = "Date can’t be in the future."
    if not partial or "private_description" in body:
        pd = str(body.get("private_description") or "").strip()
        if not (20 <= len(pd) <= 1000):
            fields["private_description"] = "Add a few more details so we can verify the owner."
        out["private_description"] = pd
    if not partial:
        paths = body.get("image_paths") or []
        if not (2 <= len(paths) <= 6):
            fields["image_paths"] = "Add at least 2 photos."
        elif not _own_paths(paths):
            fields["image_paths"] = "One or more photos are invalid."
        out["image_paths"] = paths
    if fields:
        raise ApiError("Check the highlighted fields.", "VALIDATION", 422, fields)
    return out


def _embedding_text(row: dict) -> str:
    return " ".join([row.get("title") or "", row.get("category") or "", *(row.get("colours") or []), *(row.get("tags") or [])]).strip()


# ---------------------------------------------------------------- dashboard

@bp.get("/staff/dashboard")
@require_staff
def dashboard():
    items = db().table("items").select("id,title,status,updated_at").eq("org_id", g.principal.org_id).execute().data or []
    ids = [i["id"] for i in items]
    open_claims = []
    if ids:
        open_claims = db().table("claims").select("id,item_id,submitted_at,created_at").in_("item_id", ids).eq("chat_done", True).in_("status", OPEN_CLAIM).execute().data or []
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    returned = [i for i in items if i["status"] == "returned"]
    by_item: dict[str, list[dict]] = {}
    for c in open_claims:
        by_item.setdefault(c["item_id"], []).append(c)
    imgs = images_by_item(list(by_item))
    titles = {i["id"]: i["title"] for i in items}
    needs = [{
        "item": {"id": iid, "title": titles.get(iid, ""), "thumb_url": (imgs.get(iid) or [{}])[0].get("thumb_url")},
        "open_claims": len(cs), "oldest_claim_at": min(c["submitted_at"] or c["created_at"] for c in cs),
    } for iid, cs in by_item.items()]
    needs.sort(key=lambda n: n["oldest_claim_at"])
    return jsonify({"data": {
        "stats": {
            "available": sum(1 for i in items if i["status"] in PUBLIC_STATUSES),
            "to_review": len(open_claims),
            "ready_for_pickup": sum(1 for i in items if i["status"] == "ready_for_pickup"),
            "returned_7d": sum(1 for i in returned if (i.get("updated_at") or "") >= week_ago),
            "return_rate": round(100 * len(returned) / len(items)) if items else 0,
        },
        "needs_attention": needs,
    }})


# ---------------------------------------------------------------- items

@bp.post("/staff/uploads")
@require_staff
def uploads():
    files = (request.get_json(silent=True) or {}).get("files") or []
    if not (1 <= len(files) <= 6):
        raise ApiError("Add 1 to 6 photos.", "VALIDATION", 422, {"files": "Add at least 2 photos."})
    return jsonify({"data": {"uploads": [new_item_photo_upload(g.principal.org_id) for _ in files]}})


@bp.post("/staff/items/suggest")
@require_staff
def suggest():
    paths = (request.get_json(silent=True) or {}).get("image_paths") or []
    if not paths or not _own_paths(paths):
        raise ApiError("One or more photos are invalid.", "FORBIDDEN", 403)
    urls = list(signed_urls(paths[:4]).values())
    return jsonify({"data": ai.suggest(urls)})


@bp.post("/staff/items")
@require_staff
def create_item():
    v = _validate_item(request.get_json(silent=True) or {})
    row = {
        "org_id": g.principal.org_id, "location_id": v["location_id"], "title": v["title"], "category": v.get("category"),
        "colours": v.get("colours", []), "tags": v.get("tags", []), "exact_spot": v.get("exact_spot"),
        "found_at": v.get("found_at") or now_iso(), "status": "available", "created_by": g.principal.user_id,
    }
    row["embedding"] = ai.embed(_embedding_text(row))
    details = ai.split_details(v["private_description"])
    item = db().table("items").insert(row).execute().data[0]
    try:
        db().table("item_images").insert([{"item_id": item["id"], "path": p, "position": n, "is_cover": n == 0} for n, p in enumerate(v["image_paths"])]).execute()
        db().table("item_secrets").insert({"item_id": item["id"], "private_description": v["private_description"], "details": details}).execute()
    except Exception:
        db().table("items").delete().eq("id", item["id"]).execute()  # keep publish all-or-nothing
        raise
    _audit("item_created", item["id"])
    return jsonify({"data": {"id": item["id"]}}), 201


@bp.get("/staff/items")
@require_staff
def list_items():
    page = max(0, int(request.args.get("page") or 0))
    q = db().table("items").select("id,title,status,found_at,location_id,category,tags,colours").eq("org_id", g.principal.org_id)
    status = request.args.get("status")
    q = q.eq("status", status) if status else q.neq("status", "archived")
    if request.args.get("location_id"):
        q = q.eq("location_id", request.args["location_id"])
    term = (request.args.get("q") or "").strip()[:100]
    if term:
        safe = re.sub(r"[,()*%]", " ", term)
        q = q.or_(f"title.ilike.%{safe}%,search_doc.ilike.%{safe.lower()}%")
    rows = q.order("created_at", desc=True).range(page * 24, page * 24 + 24).execute().data or []
    has_more = len(rows) > 24
    rows = rows[:24]
    counts: dict[str, int] = {}
    if rows:
        for c in db().table("claims").select("item_id").in_("item_id", [r["id"] for r in rows]).eq("chat_done", True).execute().data or []:
            counts[c["item_id"]] = counts.get(c["item_id"], 0) + 1
    cards = item_cards(rows)
    for c in cards:
        c["claim_count"] = counts.get(c["id"], 0)
    return jsonify({"data": {"items": cards, "next_page": page + 1 if has_more else None}})


@bp.get("/staff/items/<item_id>")
@require_staff
def get_item(item_id):
    i = _org_item(item_id)
    loc = locations_by_id([i["location_id"]]).get(i["location_id"], {})
    secret = db().table("item_secrets").select("private_description").eq("item_id", item_id).limit(1).execute().data
    claims = db().table("claims").select("id").eq("item_id", item_id).execute().data or []
    claim_ids = [c["id"] for c in claims]
    events = db().table("audit_events").select("type,actor_id,data,created_at").in_("entity_id", [item_id, *claim_ids]).order("created_at", desc=True).limit(50).execute().data or []
    staff = {s["user_id"]: s["display_name"] for s in db().table("staff_members").select("user_id,display_name").eq("org_id", g.principal.org_id).execute().data or []}
    people = profiles_by_user([e["actor_id"] for e in events if e.get("actor_id") and e["actor_id"] not in staff])
    return jsonify({"data": {
        "id": i["id"], "title": i["title"], "category": i.get("category"), "colours": i.get("colours") or [], "tags": i.get("tags") or [],
        "exact_spot": i.get("exact_spot"), "found_at": i["found_at"], "status": i["status"], "archive_reason": i.get("archive_reason"),
        "location": {k: loc.get(k) for k in ("id", "name", "address", "desk_hours", "lat", "lng")},
        "images": public_image_refs(item_id),
        "private_description": secret[0]["private_description"] if secret else "",
        "claim_count": len(db().table("claims").select("id").eq("item_id", item_id).eq("chat_done", True).execute().data or []),
        "timeline": [{
            "type": EVENT_NAMES.get(e["type"], e["type"]), "at": e["created_at"],
            "actor": staff.get(e.get("actor_id")) or (people.get(e.get("actor_id")) or {}).get("full_name"),
            "note": (e.get("data") or {}).get("reason"),
        } for e in events],
    }})


@bp.patch("/staff/items/<item_id>")
@require_staff
def update_item(item_id):
    item = _org_item(item_id)
    v = _validate_item(request.get_json(silent=True) or {}, partial=True)
    secret = v.pop("private_description", None)
    if v:
        merged = {**item, **v}
        if any(k in v for k in ("title", "category", "colours", "tags")):
            v["embedding"] = ai.embed(_embedding_text(merged)) or item.get("embedding")
        db().table("items").update(v).eq("id", item_id).execute()
    if secret is not None:
        db().table("item_secrets").update({"private_description": secret, "details": ai.split_details(secret)}).eq("item_id", item_id).execute()
    _audit("item_edited", item_id)
    return jsonify({"data": {"id": item_id}})


@bp.post("/staff/items/<item_id>/archive")
@require_staff
def archive(item_id):
    _org_item(item_id, "id")
    reason = (request.get_json(silent=True) or {}).get("reason")
    if reason not in ARCHIVE_REASONS:
        raise ApiError("Choose a reason.", "VALIDATION", 422, {"reason": "Choose a reason."})
    if db().table("claims").select("id").eq("item_id", item_id).eq("status", "approved").limit(1).execute().data:
        raise ApiError("This item has an approved claim. Complete or cancel the pickup first.", "ARCHIVE_BLOCKED", 409)
    db().table("items").update({"status": "archived", "archive_reason": reason, "archived_at": now_iso()}).eq("id", item_id).execute()
    closed = db().table("claims").update({"status": "not_selected", "decided_at": now_iso(), "decided_by": g.principal.user_id}).eq("item_id", item_id).in_("status", OPEN_CLAIM).execute().data or []
    _audit("item_archived", item_id, {"reason": reason})
    claim_status_changed([c["id"] for c in closed if c.get("chat_done")], "not_selected")
    return jsonify({"data": {"ok": True}})


# ---------------------------------------------------------------- claims

@bp.get("/staff/items/<item_id>/claims")
@require_staff
def item_claims(item_id):
    _org_item(item_id, "id")
    sweep_stuck(item_id)
    rows = db().table("claims").select("*").eq("item_id", item_id).eq("chat_done", True).execute().data or []
    rows.sort(key=lambda c: (-(c["score"] if c["score"] is not None else -1), c.get("submitted_at") or ""))
    secret = db().table("item_secrets").select("details").eq("item_id", item_id).limit(1).execute().data
    details = (secret[0].get("details") if secret else None) or []
    people = profiles_by_user([c["claimant_id"] for c in rows])
    msgs: dict[str, list[dict]] = {}
    if rows:
        for m in db().table("claim_messages").select("claim_id,role,content,created_at").in_("claim_id", [c["id"] for c in rows]).order("created_at").execute().data or []:
            msgs.setdefault(m["claim_id"], []).append({"role": m["role"], "content": m["content"], "created_at": m["created_at"]})
    proofs = signed_urls([c["proof_image_path"] for c in rows if c.get("proof_image_path")])
    return jsonify({"data": {"claims": [{
        "id": c["id"], "status": c["status"], "claimant": claimant_out(people.get(c["claimant_id"])),
        "score": c["score"], "score_label": c["score_label"], "score_state": c["score_state"], "rationale": c.get("rationale"),
        "details": details, "submitted_at": c.get("submitted_at"), "messages": msgs.get(c["id"], []),
        "proof_url": proofs.get(c.get("proof_image_path")), "reject_reason": c.get("reject_reason"),
    } for c in rows]}})


@bp.post("/staff/claims/<claim_id>/rescore")
@require_staff
def rescore(claim_id):
    claim = _org_claim(claim_id)
    if not claim["chat_done"]:
        raise ApiError("This claim isn’t finished yet.", "NOT_OPEN", 409)
    db().table("claims").update({"score_state": "pending", "scoring_attempts": 0}).eq("id", claim_id).execute()
    run_scoring(claim_id, force=True)
    return jsonify({"data": {"ok": True}})


@bp.post("/staff/claims/<claim_id>/approve")
@require_staff
def approve(claim_id):
    claim = _org_claim(claim_id)
    if db().table("claims").select("id").eq("item_id", claim["item_id"]).eq("status", "approved").neq("id", claim_id).limit(1).execute().data:
        raise ApiError("This item already has an approved claim.", "ALREADY_APPROVED", 409)
    if claim["status"] not in OPEN_CLAIM or not claim["chat_done"]:
        raise ApiError("This claim is already closed.", "NOT_OPEN", 409)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    code = pickup_code()
    secret = current_app.config["PICKUP_HMAC_SECRET"]
    try:
        db().rpc("approve_claim", {
            "p_claim_id": claim_id, "p_staff_id": g.principal.user_id, "p_code_hash": hash_code(code, claim_id),
            "p_code_ciphertext": encrypt_code(code, secret), "p_qr_token": make_qr_token(claim_id, int(expires.timestamp()), secret),
            "p_expires_at": expires.isoformat(),
        }).execute()
    except Exception as exc:  # the RPC raises when another staff member approved first
        msg = str(exc)
        if "already approved" in msg or "23505" in msg:
            raise ApiError("This item already has an approved claim.", "ALREADY_APPROVED", 409) from exc
        if "claim unavailable" in msg:
            raise ApiError("This claim is already closed.", "NOT_OPEN", 409) from exc
        raise
    others = db().table("claims").select("id").eq("item_id", claim["item_id"]).eq("status", "not_selected").eq("chat_done", True).gte("decided_at", (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()).execute().data or []
    claim_status_changed([claim_id], "approved")
    claim_status_changed([o["id"] for o in others], "not_selected")
    return jsonify({"data": {"ok": True, "expires_at": expires.isoformat()}})


@bp.post("/staff/claims/<claim_id>/reject")
@require_staff
def reject(claim_id):
    body = request.get_json(silent=True) or {}
    reason, note = body.get("reason"), (body.get("note") or "").strip() or None
    if reason not in REJECT_REASONS:
        raise ApiError("Choose a reason.", "VALIDATION", 422, {"reason": "Choose a reason."})
    if reason == "Other" and (not note or not (5 <= len(note) <= 200)):
        raise ApiError("Add 5 to 200 characters.", "VALIDATION", 422, {"note": "Add 5 to 200 characters."})
    claim = _org_claim(claim_id)
    if claim["status"] not in OPEN_CLAIM:
        raise ApiError("This claim is already closed.", "NOT_OPEN", 409)
    db().table("claims").update({"status": "rejected", "reject_reason": reason, "reject_note": note, "decided_at": now_iso(), "decided_by": g.principal.user_id}).eq("id", claim_id).execute()
    _audit("claim_rejected", claim_id, {"reason": reason})
    claim_status_changed([claim_id], "rejected")
    return jsonify({"data": {"ok": True}})


# ---------------------------------------------------------------- pickup

_verify_log: dict[str, list[float]] = {}


@bp.post("/staff/pickups/verify")
@require_staff
def verify_pickup():
    now = time.time()
    recent = [t for t in _verify_log.get(g.principal.user_id, []) if t > now - 60]
    if len(recent) >= 10:
        raise ApiError("Too many attempts. Wait a minute and try again.", "RATE_LIMITED", 429)
    _verify_log[g.principal.user_id] = [*recent, now]
    body = request.get_json(silent=True) or {}
    secret = current_app.config["PICKUP_HMAC_SECRET"]
    invalid = ApiError("That code doesn’t match any pickup.", "PICKUP_INVALID", 404)
    q = db().table("pickups").select("claim_id,code_hash,expires_at,collected_at,claims!inner(id,status,claimant_id,item_id,items!inner(id,org_id,title))").eq("claims.items.org_id", g.principal.org_id)
    if body.get("qr_token"):
        claim_id = verify_qr_token(str(body["qr_token"]), secret)
        if not claim_id:
            # Signature fine but expired tokens return None too; look up by token to give the right message.
            match = q.eq("qr_token", str(body["qr_token"])).limit(1).execute().data
            if match:
                raise ApiError("This code expired. Approve the claim again to issue a new one.", "PICKUP_EXPIRED", 410)
            raise invalid
        rows = q.eq("claim_id", claim_id).limit(1).execute().data or []
    elif re.fullmatch(r"\d{6}", str(body.get("code") or "")):
        rows = [p for p in (q.execute().data or []) if p["code_hash"] == hash_code(body["code"], p["claim_id"])]
    else:
        raise invalid
    if not rows:
        raise invalid
    p = rows[0]
    if p.get("collected_at"):
        raise ApiError("This item was already collected.", "PICKUP_USED", 409)
    if datetime.fromisoformat(p["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise ApiError("This code expired. Approve the claim again to issue a new one.", "PICKUP_EXPIRED", 410)
    claim = p["claims"]
    if claim["status"] != "approved":
        raise invalid
    person = profiles_by_user([claim["claimant_id"]]).get(claim["claimant_id"])
    cover = (images_by_item([claim["item_id"]]).get(claim["item_id"]) or [None])[0]
    return jsonify({"data": {
        "claim_id": p["claim_id"], "claimant": claimant_out(person), "expires_at": p["expires_at"],
        "item": {"id": claim["item_id"], "title": claim["items"]["title"], "cover_url": cover["url"] if cover else None},
    }})


@bp.post("/staff/pickups/<claim_id>/handover")
@require_staff
def handover(claim_id):
    _org_claim(claim_id)
    result = db().rpc("complete_handover", {"p_claim_id": claim_id, "p_staff_id": g.principal.user_id}).execute().data
    if not result or (isinstance(result, dict) and result.get("error")):
        err = (result or {}).get("error") if isinstance(result, dict) else None
        if err == "used":
            raise ApiError("This item was already collected.", "PICKUP_USED", 409)
        if err == "expired":
            raise ApiError("This code expired. Approve the claim again to issue a new one.", "PICKUP_EXPIRED", 410)
        raise ApiError("That code doesn’t match any pickup.", "PICKUP_INVALID", 404)
    claim_status_changed([claim_id], "collected")
    return jsonify({"data": {"ok": True}})
