from __future__ import annotations

from dataclasses import dataclass
from functools import wraps

import jwt
from flask import current_app, g, request

from .db import db
from .errors import ApiError


@dataclass(frozen=True)
class Principal:
    user_id: str
    email: str | None
    role: str
    org_id: str | None = None
    display_name: str | None = None


def _bearer_token() -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError("Sign in to continue.", "UNAUTHENTICATED", 401)
    return header.removeprefix("Bearer ").strip()


_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def _jwks(url: str) -> jwt.PyJWKClient:
    if url not in _jwks_clients:
        _jwks_clients[url] = jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600, timeout=10)
    return _jwks_clients[url]


def _claims(token: str) -> dict:
    """Verify a Supabase access token. Asymmetric keys (ES256/RS256) are checked against the project's JWKS;
    a legacy HS256 secret is used only when a real one is configured; otherwise ask Supabase Auth."""
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "")
        if alg in ("ES256", "RS256"):
            key = _jwks(current_app.config["SUPABASE_URL"]).get_signing_key_from_jwt(token).key
            return jwt.decode(token, key, algorithms=[alg], audience="authenticated")
        secret = current_app.config.get("SUPABASE_JWT_SECRET") or ""
        if alg == "HS256" and secret and not secret.startswith("replace"):
            return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
        user = db().auth.get_user(token).user
        if not user:
            raise ValueError("No user")
        return {"sub": str(user.id), "email": user.email}
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError("Your session expired. Sign in again.", "UNAUTHENTICATED", 401) from exc


def _resolve_principal(token: str) -> Principal:
    claims = _claims(token)
    user_id = claims.get("sub")
    if not user_id:
        raise ApiError("Your session is invalid.", "UNAUTHENTICATED", 401)
    staff = (
        db().table("staff_members")
        .select("org_id,display_name")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    if staff:
        return Principal(user_id, claims.get("email"), "staff", staff[0]["org_id"], staff[0]["display_name"])
    return Principal(user_id, claims.get("email"), "claimant")


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        g.principal = _resolve_principal(_bearer_token())
        return view(*args, **kwargs)
    return wrapped


def require_role(role: str):
    def decorator(view):
        @require_auth
        @wraps(view)
        def wrapped(*args, **kwargs):
            if g.principal.role != role:
                if role == "claimant":
                    raise ApiError("Staff accounts can’t make claims.", "FORBIDDEN", 403)
                raise ApiError("You do not have access to this area.", "FORBIDDEN", 403)
            return view(*args, **kwargs)
        return wrapped
    return decorator


require_claimant = require_role("claimant")
require_staff = require_role("staff")

