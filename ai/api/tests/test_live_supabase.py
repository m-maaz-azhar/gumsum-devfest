import os
import uuid
import httpx
import pytest

URL = os.getenv("SUPABASE_URL")
ANON = os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
SECRET = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

pytestmark = pytest.mark.skipif(not (URL and ANON and SECRET), reason="live Supabase env not configured")

def test_claimant_cannot_read_item_secrets():
    email = f"codex-e2e-{uuid.uuid4().hex[:10]}@example.com"
    password = f"T3st-{uuid.uuid4().hex}!"
    admin_headers = {"apikey": SECRET, "Authorization": f"Bearer {SECRET}"}
    created = httpx.post(f"{URL}/auth/v1/admin/users", headers=admin_headers, json={"email": email, "password": password, "email_confirm": True}, timeout=20)
    created.raise_for_status()
    user_id = created.json()["id"]
    try:
        token = httpx.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON}, json={"email": email, "password": password}, timeout=20)
        token.raise_for_status()
        jwt = token.json()["access_token"]
        response = httpx.get(f"{URL}/rest/v1/item_secrets?select=*", headers={"apikey": ANON, "Authorization": f"Bearer {jwt}"}, timeout=20)
        assert response.status_code in (200, 403)
        if response.status_code == 200:
            assert response.json() == []
    finally:
        deleted = httpx.delete(f"{URL}/auth/v1/admin/users/{user_id}", headers=admin_headers, timeout=20)
        deleted.raise_for_status()

def test_required_rpc_functions_are_exposed_to_service_role():
    response = httpx.get(f"{URL}/rest/v1/", headers={"apikey": SECRET, "Authorization": f"Bearer {SECRET}", "Accept": "application/openapi+json"}, timeout=20)
    response.raise_for_status()
    paths = response.json()["paths"]
    assert "/rpc/search_items" in paths
    assert "/rpc/approve_claim" in paths
    assert "/rpc/complete_handover" in paths
