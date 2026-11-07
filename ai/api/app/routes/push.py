from flask import Blueprint, g, jsonify, request

from ..auth import require_claimant
from ..db import db
from ..errors import ApiError

bp = Blueprint("push", __name__)


@bp.post("/push/subscribe")
@require_claimant
def subscribe():
    body = request.get_json(silent=True) or {}
    keys = body.get("keys") or {}
    endpoint = str(body.get("endpoint") or "")
    if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
        raise ApiError("The push subscription is incomplete.", "VALIDATION", 422)
    row = {"user_id": g.principal.user_id, "endpoint": endpoint, "p256dh": keys["p256dh"], "auth": keys["auth"]}
    db().table("push_subscriptions").upsert(row, on_conflict="endpoint").execute()
    db().table("profiles").update({"notify_push": True}).eq("user_id", g.principal.user_id).execute()
    return jsonify({"data": {"ok": True}}), 201


@bp.delete("/push/subscribe")
@require_claimant
def unsubscribe():
    endpoint = (request.get_json(silent=True) or {}).get("endpoint")
    q = db().table("push_subscriptions").delete().eq("user_id", g.principal.user_id)
    (q.eq("endpoint", endpoint) if endpoint else q).execute()
    db().table("profiles").update({"notify_push": False}).eq("user_id", g.principal.user_id).execute()
    return jsonify({"data": {"ok": True}})
