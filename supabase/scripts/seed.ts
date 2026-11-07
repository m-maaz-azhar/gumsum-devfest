// FND-01: seed organizations, locations, staff logins, demo claimants, items, secrets and claims.
// Idempotent: upserts on slug / email / fixed ids, so running it twice creates no duplicates.
// Re-running resets the demo items and claims to their seeded state.
//
//   node --env-file=.env supabase/scripts/seed.ts
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { computeScore, type Rationale } from '../../web/src/mock/ai/score.ts'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, '../../web')
const data = JSON.parse(readFileSync(join(webRoot, 'src/shared/seed/data.json'), 'utf8'))

const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!URL_ || !KEY) {
  console.error('✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) must be set.')
  process.exit(1)
}
const BUCKET = 'item-photos'
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}
const upsert = (table: string, rows: unknown[], onConflict: string) =>
  call(`/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  })
const del = (table: string, filter: string) => call(`/rest/v1/${table}?${filter}`, { method: 'DELETE' })

async function ensureUser(email: string): Promise<string> {
  const list = await call(`/auth/v1/admin/users?per_page=1000`)
  const found = list.users.find((u: { email: string }) => u.email === email)
  if (found) return found.id
  const created = await call('/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, email_confirm: true }),
  })
  return created.id
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

async function main() {
  // Organizations and locations
  const orgs = await upsert('organizations', data.organizations.map(({ id, slug, name }: any) => ({ id, slug, name })), 'slug')
  const orgId = Object.fromEntries(orgs.map((o: any) => [o.slug, o.id]))
  const locs = await upsert(
    'locations',
    data.locations.map(({ org, ...l }: any) => ({ ...l, org_id: orgId[org] })),
    'slug',
  )
  const locBySlug = Object.fromEntries(locs.map((l: any) => [l.slug, l]))
  console.log(`✓ ${orgs.length} organizations, ${locs.length} locations`)

  // Staff (Supabase Auth, email only) linked to exactly one org
  const staffRows = []
  for (const s of data.staff) staffRows.push({ user_id: await ensureUser(s.email), org_id: orgId[s.org], display_name: s.display_name })
  await upsert('staff_members', staffRows, 'user_id')
  console.log(`✓ ${staffRows.length} staff`)

  // Demo claimants
  const claimantId: Record<string, string> = {}
  for (const c of data.claimants) claimantId[c.email] = await ensureUser(c.email)
  await upsert(
    'profiles',
    data.claimants.map((c: any) => ({ user_id: claimantId[c.email], full_name: c.full_name, phone_e164: c.phone_e164 })),
    'user_id',
  )
  console.log(`✓ ${data.claimants.length} demo claimants`)

  // Photos → private bucket
  const images = new Set<string>(data.items.map((i: any) => i.image))
  for (const name of images) {
    for (const n of [1, 2]) {
      const file = readFileSync(join(webRoot, `public/seed/${name}-${n}.jpg`))
      await call(`/storage/v1/object/${BUCKET}/seed/${name}-${n}.jpg`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' },
        body: file,
      })
    }
  }
  console.log(`✓ ${images.size * 2} photos uploaded`)

  // Items, images, secrets
  const claimedItems = new Set(data.claims.map((c: any) => c.item))
  const staffByOrg = Object.fromEntries(staffRows.map((s) => [s.org_id, s.user_id]))
  await upsert(
    'items',
    data.items.map((i: any) => {
      const loc = locBySlug[i.location]
      return {
        id: i.id, org_id: loc.org_id, location_id: loc.id, title: i.title, category: i.category,
        colours: i.colours, tags: i.tags, exact_spot: i.exact_spot, found_at: hoursAgo(i.hours_ago),
        status: claimedItems.has(i.id) ? 'claim_pending' : 'available', archive_reason: null, archived_at: null,
        created_by: staffByOrg[loc.org_id],
      }
    }),
    'id',
  )
  const itemIds = data.items.map((i: any) => i.id).join(',')
  await del('item_images', `item_id=in.(${itemIds})`)
  await call('/rest/v1/item_images', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      data.items.flatMap((i: any) => [1, 2].map((n) => ({ item_id: i.id, path: `seed/${i.image}-${n}.jpg`, position: n - 1, is_cover: n === 1 }))),
    ),
  })
  await upsert(
    'item_secrets',
    data.items.map((i: any) => ({ item_id: i.id, private_description: i.private_description, details: i.details })),
    'item_id',
  )
  console.log(`✓ ${data.items.length} items with photos and secrets`)

  // Claims (pre-scored with the same formula the API uses)
  await del('pickups', `claim_id=in.(${data.claims.map((c: any) => c.id).join(',')})`)
  await upsert(
    'claims',
    data.claims.map((c: any) => {
      const { score, label } = computeScore(c.rationale as Rationale)
      const at = hoursAgo(c.hours_ago)
      return {
        id: c.id, item_id: c.item, claimant_id: claimantId[c.claimant], status: 'under_review', chat_done: true,
        followups_asked: c.followups_asked, score, score_label: label, score_state: 'done', rationale: c.rationale,
        model_version: 'seed', submitted_at: at, scored_at: at, created_at: at, reject_reason: null, reject_note: null,
        decided_at: null, decided_by: null,
      }
    }),
    'id',
  )
  await del('claim_messages', `claim_id=in.(${data.claims.map((c: any) => c.id).join(',')})`)
  await call('/rest/v1/claim_messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      data.claims.flatMap((c: any) =>
        c.messages.map(([role, content]: [string, string], k: number) => ({
          claim_id: c.id, role, content, created_at: new Date(Date.now() - c.hours_ago * 3600_000 + k * 30_000).toISOString(),
        })),
      ),
    ),
  })
  console.log(`✓ ${data.claims.length} scored claims with transcripts`)
}

main().catch((e) => {
  console.error('✖ Seed failed:', e.message)
  process.exit(1)
})
