# Lost & Found API

Flask provides the privileged and AI-facing API for the Lost & Found PWA. Supabase remains the system of record and handles email OTP, sessions, Storage and Realtime.

## Frontend boundary

React talks directly to Supabase only for:

1. `supabase.auth.signInWithOtp`, `verifyOtp`, session refresh and sign-out.
2. Uploading file bytes to a signed URL issued by Flask.
3. Realtime subscriptions allowed by RLS.

React sends the Supabase access token to every Flask endpoint:

```http
Authorization: Bearer <supabase-access-token>
```

Do not put `SUPABASE_SECRET_KEY`, the Postgres password, OpenAI key or pickup secret in the React project.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r api\requirements.txt
$env:FLASK_APP = "api/run.py"
.\.venv\Scripts\flask run --port 5000
```

Load the variables from `api/.env.example` through your deployment platform or shell. This workspace uses `.env.local`; it is ignored by Git.

Swagger UI: `http://localhost:5000/docs`

OpenAPI file: `api/openapi.yaml`

## Database

The supplied Supabase project already contained the core tables, RLS and search RPC. Migration `supabase/migrations/202611070001_api_functions.sql` adds encrypted pickup-code storage and atomic approval/handover RPCs. It is idempotent.

The browser cannot read `item_secrets`. In the configured project, a real claimant JWT receives `403 Forbidden`, which is stricter than returning an empty list.

## Tests

```powershell
.\.venv\Scripts\python -c "from dotenv import load_dotenv; load_dotenv('.env.local'); import pytest,sys; sys.exit(pytest.main(['-q','api/tests']))"
```

The live tests create temporary Supabase Auth users, verify RLS/RPC behavior, and delete those users in cleanup.

## AI privacy switch

Search embeddings are configured through `OPENAI_EMBED_MODEL`. Private-description scoring currently uses the deterministic code path in `api/app/services/ai.py`. Sending private item descriptions, claim transcripts or item photos to OpenAI must be explicitly approved before enabling the model-backed coverage, scoring and vision paths.

## Production notes

- Use Redis for Flask-Limiter instead of the in-memory development backend.
- Run Gunicorn on Linux; Windows is for local development only.
- Rotate `PICKUP_HMAC_SECRET` carefully. Existing encrypted pickup codes depend on it.
- Keep CORS restricted to the deployed PWA origin.
- Apply migrations before deploying a new API release.
