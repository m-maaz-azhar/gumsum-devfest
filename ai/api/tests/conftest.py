import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

import pytest
from app import create_app

class TestConfig:
    TESTING = True
    SECRET_KEY = "test"
    CORS_ORIGINS = ["http://localhost:5173"]
    SUPABASE_URL = ""
    SUPABASE_SERVICE_ROLE_KEY = ""
    SUPABASE_JWT_SECRET = ""
    OPENAI_API_KEY = ""
    OPENAI_VISION_MODEL = "test"
    OPENAI_TEXT_MODEL = "test"
    OPENAI_EMBED_MODEL = "test"
    PICKUP_HMAC_SECRET = "test-secret"
    SIGNED_URL_TTL = 600

@pytest.fixture
def client():
    return create_app(TestConfig).test_client()
