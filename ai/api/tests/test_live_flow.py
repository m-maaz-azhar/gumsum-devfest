"""End-to-end API flow against the real Supabase project and OpenAI.

Creates its own staff-published item and throwaway claimants, walks found → claimed → scored →
approved → collected, probes edge cases, and cleans everything up. Skips when env isn't configured.

    ../.venv/bin/python -m pytest -q tests/test_live_flow.py
"""
import os
import uuid
from pathlib import Path

import httpx
import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).parents[1] / ".env")
URL = os.getenv("SUPABASE_URL")
ANON = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
SECRET = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
pytestmark = pytest.mark.skipif(not (URL and ANON and SECRET), reason="live Supabase env not configured")

ADMIN = {"apikey": SECRET or "", "Authorization": f"Bearer {SECRET}"}
SEED = Path(__file__).parents[3] / "web" / "public" / "seed"
SECRET_WORDS = ["wooden", "carved", "initials", "bent", "spoke", "polka", "dots"]
PRIVATE = "Wooden handle with the initials M.K. carved into it, one bent spoke, white polka dots on the inside"


def jwt_for(email: str) -> str:
    otp = httpx.post(f"{URL}/auth/v1/admin/generate_link", headers=ADMIN, json={"type": "magiclink", "email": email}, timeout=20).json()["email_otp"]
    return httpx.post(f"{URL}/auth/v1/verify", headers={"apikey": ANON}, json={"type": "email", "email": email, "token": otp}, timeout=20).json()["access_token"]


@pytest.fixture(scope="module")
def api():
    from run import app

    c = app.test_client()

    def call(method, path, token, body=None):
        r = c.open(f"/v1{path}", method=method, json=body, headers={"Authorization": f"Bearer {token}"})
        j = r.get_json(silent=True) or {}
        return r.status_code, j.get("data", j)

    return call


@pytest.fixture(scope="module")
def world(api):
    """Staff token, a fresh published item, and two onboarded claimants. Cleaned up afterwards."""
    tag = uuid.uuid4().hex[:8]
    staff = jwt_for("staff@atrium.gumsum.test")
    emails = [f"api-flow-{tag}-{n}@claimant.gumsum.test" for n in ("a", "b")]
    tokens = [jwt_for(e) for e in emails]
    for t, name, phone in zip(tokens, ["Asad Flow", "Bina Flow"], ["+923001112233", "+923004445566"]):
        assert api("PUT", "/me", t, {"full_name": name})[0] == 200
        assert api("PUT", "/me", t, {"phone_e164": phone})[0] == 200

    # Staff uploads 2 photos through signed URLs, then publishes.
    st, up = api("POST", "/staff/uploads", staff, {"files": [{"name": "a.jpg", "type": "image/jpeg"}] * 2})
    assert st == 200 and len(up["uploads"]) == 2
    for target, name in zip(up["uploads"], ["umbrella-1.jpg", "umbrella-2.jpg"]):
        r = httpx.put(f"{URL}/storage/v1/object/upload/sign/item-photos/{target['path']}?token={target['token']}",
                      content=(SEED / name).read_bytes(), headers={"content-type": "image/jpeg"}, timeout=30)
        assert r.status_code in (200, 201), r.text
    paths = [u["path"] for u in up["uploads"]]
    me = api("GET", "/me", staff)[1]
    loc = next(l for l in me["locations"] if l["name"] == "Atrium Mall")
    st, item = api("POST", "/staff/items", staff, {
        "title": f"Red umbrella {tag}", "category": "umbrella", "colours": ["red"], "tags": ["umbrella"],
        "location_id": loc["id"], "exact_spot": "Main entrance", "private_description": PRIVATE, "image_paths": paths,
    })
    assert st == 201, item
    yield {"staff": staff, "a": tokens[0], "b": tokens[1], "item_id": item["id"], "paths": paths, "tag": tag}

    db_headers = {**ADMIN, "content-type": "application/json"}
    httpx.delete(f"{URL}/rest/v1/items?id=eq.{item['id']}", headers=db_headers, timeout=20)
    httpx.request("DELETE", f"{URL}/storage/v1/object/item-photos", headers=db_headers, json={"prefixes": paths}, timeout=20)
    users = httpx.get(f"{URL}/auth/v1/admin/users?per_page=1000", headers=ADMIN, timeout=20).json()["users"]
    for u in users:
        if u["email"] in emails:
            httpx.delete(f"{URL}/auth/v1/admin/users/{u['id']}", headers=ADMIN, timeout=20)


def test_roles_and_onboarding(api, world):
    st, me = api("GET", "/me", world["a"])
    assert st == 200 and me["role"] == "claimant" and me["needs_onboarding"] is False
    st, staff = api("GET", "/me", world["staff"])
    assert staff["role"] == "staff" and staff["org"]["name"] == "Atrium Mall" and staff["locations"]
    assert api("GET", "/staff/dashboard", world["a"])[0] == 403
    assert api("POST", "/claims", world["staff"], {"item_id": world["item_id"], "message": "x" * 20})[0] == 403
    st, err = api("PUT", "/me", world["a"], {"phone_e164": "+92123"})
    assert st == 422 and "phone_e164" in err["error"]["fields"]
    assert api("GET", "/me", "not-a-token")[0] == 401


def test_public_item_never_leaks_secret(api, world):
    st, item = api("GET", f"/items/{world['item_id']}", world["a"])
    assert st == 200 and len(item["images"]) == 2 and item["images"][0]["url"].startswith("https://")
    body = str(item).lower()
    assert "polka" not in body and "carved" not in body and "private_description" not in body


def test_search_parses_and_never_searches_secrets(api, world):
    st, res = api("POST", "/search", world["a"], {"q": "black bag in atrium mall"})
    assert st == 200 and res["parsed"]["where_matched"] is True
    assert res["results"][0]["title"] == "Black backpack"
    st, res = api("POST", "/search", world["a"], {"q": "white polka dots carved initials"})
    assert world["item_id"] not in [r["id"] for r in res["results"]]  # D4
    st, res = api("POST", "/search", world["a"], {"q": "umbrella at the moon base"})
    assert res["parsed"]["where_matched"] is False and res["results"]
    assert api("POST", "/search", world["a"], {"q": " x "})[0] == 422


def test_suggest_from_photos(api, world):
    st, s = api("POST", "/staff/items/suggest", world["staff"], {"image_paths": world["paths"]})
    assert st == 200 and "umbrella" in (s["title"] + s["category"]).lower()
    assert api("POST", "/staff/items/suggest", world["staff"], {"image_paths": ["items/other-org/x.jpg"]})[0] == 403


def test_claim_validation_and_moderation(api, world):
    assert api("POST", "/claims", world["b"], {"item_id": world["item_id"], "message": "too short"})[0] == 422
    st, err = api("POST", "/claims", world["b"], {"item_id": world["item_id"], "message": "this is my shit umbrella give it back"})
    assert st == 422 and err["error"]["code"] == "MODERATION"


def test_full_flow(api, world):
    a, b, staff, item_id = world["a"], world["b"], world["staff"], world["item_id"]
    # Strong claimant: covers details; follow-ups (if any) must never leak.
    st, turn = api("POST", "/claims", a, {"item_id": item_id, "message": "My red umbrella. The wooden handle has my initials M.K. carved into it."})
    assert st == 201, turn
    claim_a = turn["claim_id"]
    while not turn["done"]:
        q = turn["reply"].lower()
        assert not any(w in q for w in SECRET_WORDS), q
        st, turn = api("POST", f"/claims/{claim_a}/messages", a, {"message": "One spoke is bent, and the inside has white polka dots."})
        assert st == 200
    # Resume / duplicate protection
    st, err = api("POST", "/claims", a, {"item_id": item_id, "message": "Another attempt at claiming this item"})
    assert st == 403 and err["error"]["code"] == "ALREADY_CLAIMED"
    # Weak claimant
    st, turn = api("POST", "/claims", b, {"item_id": item_id, "message": "I think it is my umbrella, it was red I guess, from the mall."})
    claim_b = turn["claim_id"]
    while not turn["done"]:
        st, turn = api("POST", f"/claims/{claim_b}/messages", b, {"message": "I don't know"})
    for t, cid in ((a, claim_a), (b, claim_b)):
        assert api("POST", f"/claims/{cid}/score", t)[0] == 200

    st, ranked = api("GET", f"/staff/items/{item_id}/claims", staff)
    debug = [(c["id"] == claim_a and "A" or "B", c["score"], c["score_label"], c["score_state"], (c["rationale"] or {}).get("summary")) for c in ranked["claims"]]
    assert st == 200 and [c["id"] for c in ranked["claims"]] == [claim_a, claim_b], debug
    top, low = ranked["claims"]
    assert top["score_state"] == "done" and top["score_label"] == "High", top
    assert low["score"] < top["score"] and low["score_label"] in ("Low", "Medium")
    assert top["claimant"] == {"name": "Asad Flow", "phone_last4": "2233"}
    assert len(top["rationale"]["details"]) == len(top["details"]) >= 2

    st, mine = api("GET", "/claims", a)
    assert mine["claims"][0]["status"] == "under_review" and "score" not in str(mine).lower()
    st, dash = api("GET", "/staff/dashboard", staff)
    assert any(n["item"]["id"] == item_id and n["open_claims"] == 2 for n in dash["needs_attention"])

    # Reject needs a reason; approve is atomic and single
    assert api("POST", f"/staff/claims/{claim_b}/reject", staff, {"reason": "Other", "note": "no"})[0] == 422
    assert api("POST", f"/staff/claims/{claim_a}/approve", staff)[0] == 200
    st, err = api("POST", f"/staff/claims/{claim_b}/approve", staff)
    assert st == 409 and err["error"]["code"] in ("ALREADY_APPROVED", "NOT_OPEN")
    assert api("GET", "/claims", b)[1]["claims"][0]["status"] == "not_selected"
    st, err = api("POST", f"/staff/items/{item_id}/archive", staff, {"reason": "Donated"})
    assert st == 409 and err["error"]["code"] == "ARCHIVE_BLOCKED"
    assert api("GET", f"/claims/{claim_b}/pickup", b)[0] == 403

    # Pickup: code shown to the owner, verified at the desk, single use
    st, card = api("GET", f"/claims/{claim_a}/pickup", a)
    assert st == 200 and len(card["code"]) == 6 and card["qr_token"]
    wrong = f"{(int(card['code']) + 1) % 1_000_000:06d}"
    assert api("POST", "/staff/pickups/verify", staff, {"code": wrong})[1]["error"]["code"] == "PICKUP_INVALID"
    st, preview = api("POST", "/staff/pickups/verify", staff, {"qr_token": card["qr_token"]})
    assert st == 200 and preview["claimant"]["name"] == "Asad Flow"
    st, preview = api("POST", "/staff/pickups/verify", staff, {"code": card["code"]})
    assert st == 200 and preview["claim_id"] == claim_a
    assert api("POST", f"/staff/pickups/{claim_a}/handover", staff)[0] == 200
    st, err = api("POST", "/staff/pickups/verify", staff, {"code": card["code"]})
    assert st == 409 and err["error"]["code"] == "PICKUP_USED"
    assert api("GET", "/claims", a)[1]["claims"][0]["status"] == "collected"
    st, item = api("GET", f"/staff/items/{item_id}", staff)
    assert item["status"] == "returned" and {"claim_approved", "handed_over", "item_created"} <= {e["type"] for e in item["timeline"]}


def test_delete_account_withdraws(api, world):
    st, _ = api("DELETE", "/me", world["b"])
    assert st == 200
    st, me = api("GET", "/me", world["b"])
    assert me["needs_onboarding"] is True and me["profile"] is None
