from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Local development: read api/.env. Real environment variables (deployments) always win.
load_dotenv(Path(__file__).parents[1] / ".env", override=False)


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    CORS_ORIGINS = [
        value.strip()
        for value in os.getenv("CORS_ORIGINS", "http://localhost:5180,https://gumsum.vercel.app").split(",")
        if value.strip()
    ]
    # Local development: also allow any localhost port (the PWA dev server and test runners).
    if os.getenv("FLASK_ENV", "production") == "development":
        CORS_ORIGINS = [*CORS_ORIGINS, r"^http://localhost:\d+$", r"^http://127\.0\.0\.1:\d+$"]
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", os.getenv("SUPABASE_PUBLISHABLE_KEY", ""))
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_SECRET_KEY", ""))
    SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4.1-mini")
    OPENAI_TEXT_MODEL = os.getenv("OPENAI_TEXT_MODEL", "gpt-4.1-mini")
    OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")
    PICKUP_HMAC_SECRET = os.getenv("PICKUP_HMAC_SECRET", SECRET_KEY)
    VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
    VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
    SMTP_URL = os.getenv("SMTP_URL", "")
    # Send private descriptions, claim transcripts and item photos to OpenAI for coverage, scoring and
    # detail splitting (ARCHITECTURE §6). Set to "false" to use the deterministic rules only.
    AI_PRIVATE_DATA_ENABLED = os.getenv("AI_PRIVATE_DATA_ENABLED", "true").lower() not in ("0", "false", "no")
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASS = os.getenv("SMTP_PASS", "")
    SMTP_SENDER_EMAIL = os.getenv("SMTP_SENDER_EMAIL", "")
    SMTP_SENDER_NAME = os.getenv("SMTP_SENDER_NAME", "Gumsum")
    APP_URL = os.getenv("APP_URL", "https://gumsum.vercel.app")
    UPLOAD_MAX_BYTES = int(os.getenv("UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))
    SIGNED_URL_TTL = int(os.getenv("SIGNED_URL_TTL", "600"))
    IMAGE_URL_TTL = int(os.getenv("IMAGE_URL_TTL", "3600"))
    TESTING = False
