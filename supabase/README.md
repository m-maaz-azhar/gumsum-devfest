# Supabase

Schema, RLS, storage and search for Gumsum (see [ARCHITECTURE.md §4](../docs/ARCHITECTURE.md)).

| File | What |
|---|---|
| `migrations/20261107000001_init.sql` | Tables, enums, indexes, RLS, `item-photos` bucket, Realtime on `claims`, `match_locations()` and `search_items()` RPCs. Safe to re-run. |
| `scripts/seed.ts` | FND-01. Orgs, locations, staff logins, 4 demo claimants, 12 items (photos + secrets) and 4 pre-scored claims. Idempotent. |
| `scripts/test-rls.ts` | FND-02. Signs in as anon, a claimant and two staff members and proves nobody can read `item_secrets` or another org's rows. |

## Run

```bash
# from the repo root; .env needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_POSTGRES_PASSWORD
PGPASSWORD=$SUPABASE_POSTGRES_PASSWORD psql "host=aws-0-ap-southeast-2.pooler.supabase.com port=5432 \
  user=postgres.ykivspdzjmzmzqdrvhje dbname=postgres sslmode=require" -f supabase/migrations/20261107000001_init.sql
node --env-file=.env supabase/scripts/seed.ts
node --env-file=.env supabase/scripts/test-rls.ts
```

The direct host `db.<ref>.supabase.co` is IPv6 only; use the session pooler above.

## Notes for the Flask API

- **Seeded logins:** `staff@atrium.gumsum.test` (Atrium Mall), `staff@devfest.gumsum.test` (DevFest 2026), and claimants `sara@`, `omar@`, `hina@`, `ali@claimant.gumsum.test`. Get a code without email via `POST /auth/v1/admin/generate_link {type:"magiclink", email}`, which returns `email_otp`.
- **OTP:** 6-digit email codes, 10-minute expiry, sent through Resend SMTP. Templates in `templates/`, applied by `scripts/apply-auth-config.ts`.
- **Claim states:** `claims.score_state` is `pending | done | failed` (drives "Scoring…" and "Score unavailable"). `claims.chat_done` marks the end of the chat; `status` follows the Status Model sheet.
- **One approved claim per item** is enforced by the partial unique index `claims_one_approved_per_item`.
- **Search:** `search_items(query_embedding, what_text, where_text, lat, lng, p_location_id, page, page_size)` ranks `0.7 * vector + 0.3 * trigram`, or trigram alone when `query_embedding` is null. It returns `where_matched` (null when there was no where, false when the place was not recognised). Seeded items have no embeddings yet; backfill them from `title + category + colours + tags`.
- **Photos** are in the private `item-photos` bucket under `seed/<name>-<n>.jpg`. Hand out signed URLs.
