from flask import Blueprint, g, jsonify, request

from ..auth import require_claimant
from ..db import db
from ..errors import ApiError
from ..schemas import SearchInput
from ..serializers import PUBLIC_STATUSES, available_counts, distance_km, item_cards, locations_by_id, place, public_image_refs
from ..services import ai

bp = Blueprint("items", __name__)

ITEM_FIELDS = "id,title,category,colours,tags,exact_spot,found_at,status,location_id"


def _latlng():
    try:
        lat, lng = request.args.get("lat"), request.args.get("lng")
        return (float(lat), float(lng)) if lat and lng else (None, None)
    except ValueError:
        return None, None


@bp.get("/places")
@require_claimant
def places():
    lat, lng = _latlng()
    locs = db().table("locations").select("id,name,address,lat,lng,desk_hours").execute().data or []
    counts = available_counts()
    out = [place(l, counts, lat, lng) for l in locs]
    out.sort(key=lambda p: (p["distance_km"] if p["distance_km"] is not None else 1e9, -p["available_count"]))
    return jsonify({"data": {"places": out}})


@bp.get("/items/recent")
@require_claimant
def recent():
    lat, lng = _latlng()
    rows = db().table("items").select(ITEM_FIELDS).in_("status", PUBLIC_STATUSES).order("found_at", desc=True).limit(60).execute().data or []
    if lat is not None:
        locs = locations_by_id([r["location_id"] for r in rows])
        near = [r for r in rows if (distance_km(lat, lng, locs.get(r["location_id"], {}).get("lat"), locs.get(r["location_id"], {}).get("lng")) or 0) <= 25]
        rows = near or rows
    return jsonify({"data": {"items": item_cards(rows[:20], g.principal.user_id)}})


@bp.get("/items/<item_id>")
@require_claimant
def item(item_id):
    rows = db().table("items").select(ITEM_FIELDS).eq("id", item_id).neq("status", "archived").limit(1).execute().data
    if not rows:
        raise ApiError("This item is no longer listed.", "NOT_FOUND", 404)
    i = rows[0]
    loc = locations_by_id([i["location_id"]]).get(i["location_id"], {})
    mine = db().table("claims").select("id,status,chat_done").eq("item_id", item_id).eq("claimant_id", g.principal.user_id).limit(1).execute().data
    # Explicit allow-list: never spread the row, never read item_secrets here.
    return jsonify({"data": {
        "id": i["id"], "title": i["title"], "category": i.get("category"), "colours": i.get("colours") or [], "tags": i.get("tags") or [],
        "exact_spot": i.get("exact_spot"), "found_at": i["found_at"], "status": i["status"],
        "location": {k: loc.get(k) for k in ("id", "name", "address", "desk_hours", "lat", "lng")},
        "images": public_image_refs(i["id"]),
        "my_claim": mine[0] if mine else None,
    }})


@bp.post("/search")
@require_claimant
def search():
    body = SearchInput.model_validate(request.get_json(silent=True) or {})
    parsed = ai.parse_query(body.q)
    what, where = parsed.get("what"), parsed.get("where")
    where_matched = None
    if where and not body.location_id:
        where_matched = bool(db().rpc("match_locations", {"where_text": where}).execute().data)
    vector = ai.embed(what) if what else None
    rows = db().rpc("search_items", {
        "query_embedding": vector, "what_text": what, "where_text": where if where_matched else None,
        "lat": body.lat, "lng": body.lng, "p_location_id": body.location_id, "page": body.page, "page_size": 21,
    }).execute().data or []
    has_more = len(rows) > 20
    rows = rows[:20]
    items = [{"id": r["id"], "title": r["title"], "status": r["status"], "found_at": r["found_at"], "location_id": r["location_id"]} for r in rows]
    return jsonify({"data": {
        "parsed": {"what": what, "where": where, "where_matched": where_matched},
        "results": item_cards(items, g.principal.user_id),
        "next_page": body.page + 1 if has_more else None,
    }})
