from __future__ import annotations

from functools import lru_cache

from flask import current_app
from supabase import Client, create_client

from .errors import ApiError


@lru_cache(maxsize=4)
def _client(url: str, key: str) -> Client:
    return create_client(url, key)


def db() -> Client:
    url = current_app.config["SUPABASE_URL"]
    key = current_app.config["SUPABASE_SERVICE_ROLE_KEY"]
    if not url or not key:
        raise ApiError("Database is not configured.", "SERVICE_UNAVAILABLE", 503)
    return _client(url, key)


def one(query, *, message: str = "That resource was not found.") -> dict:
    result = query.execute()
    if not result.data:
        raise ApiError(message, "NOT_FOUND", 404)
    return result.data[0]

