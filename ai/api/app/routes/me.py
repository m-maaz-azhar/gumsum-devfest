import re

import phonenumbers
from flask import Blueprint, g, jsonify, request

from ..auth import require_auth, require_claimant
from ..db import db
from ..errors import ApiError
from ..serializers import OPEN_CLAIM, available_counts, now_iso, place, profile_out

bp = Blueprint("me", __name__)

NAME_RE = re.compile(r"^[^\W\d_][^\W\d_\s'’-]*(?:[\s'’-]+[^\W\d_]+)*$", re.UNICODE)


@bp.get("/me")
@require_auth
def get_me():
    p = g.principal
    user = {"id": p.user_id, "email": p.email or ""}
    if p.role == "staff":
        org = db().table("organizations").select("id,name,slug").eq("id", p.org_id).limit(1).execute().data
        locs = db().table("locations").select("id,name,address,lat,lng,desk_hours").eq("org_id", p.org_id).order("name").execute().data or []
        counts = available_counts([l["id"] for l in locs])
        return jsonify({"data": {
            "role": "staff", "user": user, "staff": {"display_name": p.display_name},
            "org": org[0] if org else {"id": p.org_id, "name": "", "slug": ""}, "locations": [place(l, counts) for l in locs],
        }})
    rows = db().table("profiles").select("*").eq("user_id", p.user_id).limit(1).execute().data
    profile = profile_out(rows[0] if rows else None)
    needs = not profile or not profile.get("full_name") or not profile.get("phone_e164")
    return jsonify({"data": {"role": "claimant", "user": user, "profile": profile, "needs_onboarding": needs}})


@bp.put("/me")
@require_claimant
def update_me():
    body = request.get_json(silent=True) or {}
    fields: dict[str, str] = {}
    values: dict = {}
    if "full_name" in body:
        name = str(body.get("full_name") or "").strip()
        if not (2 <= len(name) <= 50) or not NAME_RE.match(name):
            fields["full_name"] = "Enter your name as it appears on your ID."
        values["full_name"] = name
    if "phone_e164" in body:
        try:
            parsed = phonenumbers.parse(str(body.get("phone_e164") or ""), None)
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError
            values["phone_e164"] = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except Exception:  # noqa: BLE001
            fields["phone_e164"] = "Enter a valid phone number."
    for key in ("notify_push", "use_location"):
        if key in body:
            values[key] = bool(body[key])
    if fields:
        raise ApiError("Check the highlighted fields.", "VALIDATION", 422, fields)
    values["user_id"] = g.principal.user_id
    values["deleted_at"] = None
    row = db().table("profiles").upsert(values, on_conflict="user_id").execute().data[0]
    return jsonify({"data": profile_out(row)})


@bp.delete("/me")
@require_claimant
def delete_me():
    """Withdraw open requests and remove personal data (USR-PRO-01)."""
    uid = g.principal.user_id
    db().table("claims").update({"status": "withdrawn"}).eq("claimant_id", uid).in_("status", [*OPEN_CLAIM, "approved"]).execute()
    db().table("push_subscriptions").delete().eq("user_id", uid).execute()
    db().table("profiles").update({"deleted_at": now_iso(), "full_name": None, "phone_e164": None, "notify_push": False}).eq("user_id", uid).execute()
    return jsonify({"data": {"ok": True}})
