from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from cryptography.fernet import Fernet


def pickup_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"

def hash_code(code: str, claim_id: str) -> str:
    return hashlib.sha256(f"{code}:{claim_id}".encode()).hexdigest()

def _fernet(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)

def encrypt_code(code: str, secret: str) -> str:
    return _fernet(secret).encrypt(code.encode()).decode()

def decrypt_code(value: str, secret: str) -> str:
    return _fernet(secret).decrypt(value.encode()).decode()

def make_qr_token(claim_id: str, expires_at: int, secret: str) -> str:
    body = json.dumps({"c": claim_id, "e": expires_at}, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(body + b"." + signature).decode().rstrip("=")

def verify_qr_token(token: str, secret: str) -> str | None:
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        body, signature = raw.rsplit(b".", 1)
        expected = hmac.new(secret.encode(), body, hashlib.sha256).digest()
        payload = json.loads(body)
        if not hmac.compare_digest(signature, expected) or payload["e"] < int(time.time()):
            return None
        return payload["c"]
    except (ValueError, KeyError, json.JSONDecodeError):
        return None
