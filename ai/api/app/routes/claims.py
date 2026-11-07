from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request

from ..auth import require_claimant
from ..db import db
from ..errors import ApiError
from ..schemas import ClaimCreate, MessageCreate
from ..serializers import PUBLIC_STATUSES, images_by_item, locations_by_id
from ..services import ai, rules
from ..services.claims import add_message, bot_turn, run_scoring
from ..services.security import decrypt_code
from ..services.storage import new_proof_upload

bp = Blueprint("claims", __name__)


def _since(**delta) -> str:
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def _own_claim(claim_id: str, fields: str = "*") -> dict:
    rows = db().table("claims").select(fields).eq("id", claim_id).eq("claimant_id", g.principal.user_id).limit(1).execute().data
    if not rows:
        raise ApiError("Request not found.", "NOT_FOUND", 404)
    return rows[0]


def _moderate(text: str) -> None:
    if ai.is_flagged(text):
        raise ApiError("Please keep it respectful.", "MODERATION", 422)


def _message_rate_limit() -> None:
    ids = [r["id"] for r in db().table("claims").select("id").eq("claimant_id", g.principal.user_id).gte("created_at", _since(days=1)).execute().data or []]
    if ids:
        sent = db().table("claim_messages").select("id", count="exact").in_("claim_id", ids).eq("role", "user").gte("created_at", _since(hours=1)).execute()
        if (sent.count or 0) >= 20:
            raise ApiError("You’re sending messages too fast. Try again in an hour.", "RATE_LIMITED", 429)


@bp.post("/claims")
@require_claimant
def create_claim():
    body = ClaimCreate.model_validate(request.get_json(silent=True) or {})
    message = body.message.strip()
    if len(message) < 15:
        raise ApiError("Add a bit more detail.", "VALIDATION", 422, {"message": "Add a bit more detail."})
    _moderate(message)
    profile = db().table("profiles").select("full_name,deleted_at").eq("user_id", g.principal.user_id).limit(1).execute().data
    if not profile or not profile[0].get("full_name") or profile[0].get("deleted_at"):
        raise ApiError("Finish setting up your profile first.", "NEEDS_ONBOARDING", 403)
    items = db().table("items").select("id,status").eq("id", body.item_id).limit(1).execute().data
    if not items or items[0]["status"] not in PUBLIC_STATUSES:
        raise ApiError("This item can’t be claimed right now.", "NOT_CLAIMABLE", 403)

    existing = db().table("claims").select("*").eq("item_id", body.item_id).eq("claimant_id", g.principal.user_id).limit(1).execute().data
    if existing:
        claim = existing[0]
        if claim["chat_done"] or claim["status"] not in ("submitted",):
            msg = "You can’t claim this item again." if claim["status"] == "rejected" else "You already have a request for this item."
            raise ApiError(msg, "ALREADY_CLAIMED", 403)
        # Unfinished chat (sheet closed mid-way): resume it instead of blocking the claimant.
        _message_rate_limit()
        add_message(claim["id"], "user", message)
        return jsonify({"data": bot_turn(claim)}), 200

    today = db().table("claims").select("id", count="exact").eq("claimant_id", g.principal.user_id).gte("created_at", _since(days=1)).execute()
    if (today.count or 0) >= 5:
        raise ApiError("You’ve reached today’s limit. Try again tomorrow.", "RATE_LIMITED", 429)
    try:
        claim = db().table("claims").insert({
            "item_id": body.item_id, "claimant_id": g.principal.user_id, "status": "submitted",
            "chat_done": False, "followups_asked": 0, "score_state": "pending",
        }).execute().data[0]
    except Exception as exc:  # unique (item_id, claimant_id): a double tap raced us
        raise ApiError("You already have a request for this item.", "ALREADY_CLAIMED", 403) from exc
    add_message(claim["id"], "bot", rules.FIRST_QUESTION)
    add_message(claim["id"], "user", message)
    return jsonify({"data": bot_turn(claim)}), 201


@bp.post("/claims/<claim_id>/messages")
@require_claimant
def message(claim_id):
    body = MessageCreate.model_validate(request.get_json(silent=True) or {})
    claim = _own_claim(claim_id)
    if claim["chat_done"]:
        return jsonify({"data": {"claim_id": claim_id, "reply": None, "done": True, "followups_left": 0}})
    if claim["status"] != "submitted":
        raise ApiError("This request is closed.", "NOT_OPEN", 409)
    text = body.message.strip()
    if not text:
        raise ApiError("Add a short answer.", "VALIDATION", 422, {"message": "Add a short answer."})
    _moderate(text)
    _message_rate_limit()
    add_message(claim_id, "user", text)
    return jsonify({"data": bot_turn(claim)})


@bp.post("/claims/<claim_id>/score")
@require_claimant
def score(claim_id):
    """Fired by the PWA right after submit so scoring runs in its own request (serverless-safe)."""
    claim = _own_claim(claim_id, "id,chat_done,score_state")
    if claim["chat_done"] and claim["score_state"] != "done":
        run_scoring(claim_id)
    return jsonify({"data": {"ok": True}})


@bp.post("/claims/<claim_id>/proof-upload-url")
@require_claimant
def proof_upload(claim_id):
    _own_claim(claim_id, "id")
    target = new_proof_upload(claim_id)
    db().table("claims").update({"proof_image_path": target["path"]}).eq("id", claim_id).execute()
    return jsonify({"data": target})


@bp.get("/claims")
@require_claimant
def claims():
    rows = (
        db().table("claims").select("id,status,chat_done,created_at,updated_at,item_id,items(id,title,location_id)")
        .eq("claimant_id", g.principal.user_id).eq("chat_done", True).order("created_at", desc=True).execute().data or []
    )
    item_ids = [r["item_id"] for r in rows]
    imgs = images_by_item(item_ids)
    locs = locations_by_id([(r.get("items") or {}).get("location_id") for r in rows])
    out = []
    for r in rows:
        item = r.get("items") or {}
        cover = (imgs.get(r["item_id"]) or [None])[0]
        out.append({
            "id": r["id"], "status": r["status"], "chat_done": r["chat_done"], "created_at": r["created_at"], "updated_at": r["updated_at"],
            "item": {"id": r["item_id"], "title": item.get("title", ""), "cover_url": cover["url"] if cover else None,
                     "thumb_url": cover["thumb_url"] if cover else None, "location_name": locs.get(item.get("location_id"), {}).get("name", "")},
        })
    return jsonify({"data": {"claims": out}})


@bp.get("/claims/<claim_id>/pickup")
@require_claimant
def pickup(claim_id):
    claim = _own_claim(claim_id, "id,status,item_id")
    if claim["status"] not in ("approved", "collected"):
        raise ApiError("This request hasn’t been approved.", "NOT_APPROVED", 403)
    rows = db().table("pickups").select("*").eq("claim_id", claim_id).limit(1).execute().data
    if not rows or not rows[0].get("code_ciphertext"):
        raise ApiError("Pickup code unavailable. Contact the desk.", "NOT_FOUND", 404)
    p = rows[0]
    item = db().table("items").select("id,title,location_id").eq("id", claim["item_id"]).limit(1).execute().data[0]
    loc = locations_by_id([item["location_id"]]).get(item["location_id"], {})
    cover = (images_by_item([item["id"]]).get(item["id"]) or [None])[0]
    return jsonify({"data": {
        "claim_id": claim_id, "code": decrypt_code(p["code_ciphertext"], current_app.config["PICKUP_HMAC_SECRET"]),
        "qr_token": p["qr_token"], "expires_at": p["expires_at"], "collected_at": p.get("collected_at"),
        "item": {"id": item["id"], "title": item["title"], "cover_url": cover["url"] if cover else None},
        "location": {k: loc.get(k) for k in ("name", "address", "desk_hours", "lat", "lng")},
    }})
