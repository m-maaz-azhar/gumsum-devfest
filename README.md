# Gumsum

AI lost-and-found desk. One React PWA for claimants and staff, Supabase for auth, data and storage, and a Flask API (in progress, separate developer).

**Live:** https://gumsum.vercel.app · **Docs:** [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [User stories](docs/LostFound_MVP_User_Stories.xlsx)

```
web/        React 19 + Vite 8 PWA (claimant "/" and staff "/staff", role from GET /v1/me)
supabase/   migration, seed and RLS test (see supabase/README.md)
docs/       requirements
```

## Run locally

```bash
cd web
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_OTP_LENGTH
npm run dev                  # http://localhost:5180
```

## Mock API until Flask is ready

When `VITE_API_URL` is empty, the app runs an in-browser implementation of the whole `/v1` contract (`web/src/mock/`), stored in IndexedDB and seeded with the same data as the database. **Auth is always real:** Supabase email OTP, and the staff role is read from the real `staff_members` table.

To switch to Flask, set `VITE_API_URL=https://<flask-host>/v1`. No UI changes are needed.

**For the Flask developer:**
- The contract the UI expects is typed in [`web/src/shared/api/types.ts`](web/src/shared/api/types.ts). Error shape: `{ error: { code, message, fields? } }`.
- The mock shows the expected behaviour for each endpoint: [`web/src/mock/server.ts`](web/src/mock/server.ts).
- Reference logic to port to Python:
  - leak check: [`leak.ts`](web/src/mock/ai/leak.ts)
  - score formula: [`score.ts`](web/src/mock/ai/score.ts), which the seed also uses
  - regex fallback for `parse_query`: [`parse.ts`](web/src/mock/ai/parse.ts). It also handles a leading `in <place>`, which the UI sends when the user removes the "what" chip.
- Error codes the UI handles:
  - `MODERATION`, `ALREADY_CLAIMED`, `RATE_LIMITED`
  - `ALREADY_APPROVED`, `ARCHIVE_BLOCKED`
  - `PICKUP_INVALID` (404), `PICKUP_EXPIRED` (410), `PICKUP_USED` (409)
- **Pickup code:** `GET /claims/{id}/pickup` must return the code again later, but §7.2 stores it hashed. The mock derives it as `HMAC(secret, "code." + claim_id + "." + issued_at) mod 10^6` and stores only the hash. Do the same.
- Staff claim rows need `details: string[]` (the atomic secret facts) so the rationale checklist can show what matched.

## Test

```bash
cd web
npm run test          # unit: score formula, leak check, coverage, parsing, trigram (13)
npm run test:e2e      # Playwright, mobile viewport, real Supabase Auth (11): auth/roles,
                      #   claimant search + claim chat, staff add/review, full found → returned loop
npm run test:prod     # smoke test against the Vercel deployment
npm run db:test-rls   # FND-02: 19 checks that no client can read item_secrets or another org's rows
```

E2E tests get sign-in codes from the Admin API (`generate_link`), so no email is sent. They read the service key from the repo-root `.env`, never from the browser, and delete their throwaway `e2e-*` users afterwards.

## Demo logins

| Role | Email |
|---|---|
| Staff, Atrium Mall | `staff@atrium.gumsum.test` |
| Staff, DevFest 2026 | `staff@devfest.gumsum.test` |

These `.test` addresses can't receive email. To sign in by hand, add your own email as staff (insert a `staff_members` row) or use a real inbox as a claimant.

## Auth email (done)

Sign-in emails come from Resend (`gumsum@texvnx.com`) and contain a **6-digit code** that expires in 10 minutes, not a link. The templates live in `supabase/templates/`; re-apply them with:

```bash
node --env-file=.env --env-file=web/.env.local supabase/scripts/apply-auth-config.ts   # needs SUPABASE_ACCESS_TOKEN
```

Still to do: set `VITE_VAPID_PUBLIC_KEY` once Flask has VAPID keys (push notifications).
