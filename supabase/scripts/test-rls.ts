// FND-02: prove anon and claimant roles can never read item_secrets, and that every role
// only sees its own rows. Uses real JWTs minted through the Admin API (no email needed).
//
//   node --env-file=.env supabase/scripts/test-rls.ts
//
// Needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (anon) and SUPABASE_SECRET_KEY.
const URL_ = process.env.SUPABASE_URL!
const ANON = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)!
const SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!
if (!URL_ || !ANON || !SERVICE) {
  console.error('✖ SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set.')
  process.exit(1)
}

async function jwtFor(email: string): Promise<string> {
  const gen = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  }).then((r) => r.json())
  const res = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token: gen.email_otp }),
  }).then((r) => r.json())
  if (!res.access_token) throw new Error(`Could not sign in ${email}: ${JSON.stringify(res)}`)
  return res.access_token
}

/** Returns the rows a role can see, or [] when the request is refused outright. */
async function select(table: string, jwt: string | null, query = 'select=*') {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, {
    headers: { apikey: ANON, ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
  })
  if (res.status === 401 || res.status === 403) return { rows: [] as any[], refused: true }
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return { rows: (await res.json()) as any[], refused: false }
}

async function rpc(fn: string, jwt: string | null, body: object) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  })
  return res.status
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✖'} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

async function main() {
  const sara = await jwtFor('sara@claimant.gumsum.test')
  const atrium = await jwtFor('staff@atrium.gumsum.test')
  const devfest = await jwtFor('staff@devfest.gumsum.test')

  // The secret
  for (const [who, jwt] of [['anon', null], ['claimant', sara], ['atrium staff', atrium]] as const) {
    const r = await select('item_secrets', jwt)
    check(`${who} gets 0 rows from item_secrets`, r.rows.length === 0, r.refused ? 'refused' : `${r.rows.length} rows`)
  }

  // Claimant isolation
  const claims = await select('claims', sara)
  check('claimant sees only own claims', claims.rows.length > 0 && claims.rows.every((c) => c.claimant_id === claims.rows[0].claimant_id), `${claims.rows.length} rows`)
  const profiles = await select('profiles', sara)
  check('claimant sees only own profile', profiles.rows.length === 1, `${profiles.rows.length} rows`)
  const msgs = await select('claim_messages', sara)
  const ownClaimIds = new Set(claims.rows.map((c) => c.id))
  check('claimant sees only own claim messages', msgs.rows.length > 0 && msgs.rows.every((m) => ownClaimIds.has(m.claim_id)), `${msgs.rows.length} rows`)
  check('claimant reads no items directly', (await select('items', sara)).rows.length === 0)
  check('claimant reads no pickups', (await select('pickups', sara)).rows.length === 0)
  check('anon reads no items', (await select('items', null)).rows.length === 0)
  check('anon reads no claims', (await select('claims', null)).rows.length === 0)

  // Staff isolation by organization
  const aItems = await select('items', atrium, 'select=id,org_id')
  const dItems = await select('items', devfest, 'select=id,org_id')
  check('atrium staff see only their org items', aItems.rows.length > 0 && new Set(aItems.rows.map((r) => r.org_id)).size === 1, `${aItems.rows.length} rows`)
  check('devfest staff see only their org items', dItems.rows.length > 0 && !dItems.rows.some((r) => aItems.rows.find((a) => a.id === r.id)), `${dItems.rows.length} rows`)
  check('atrium staff see their claims', (await select('claims', atrium)).rows.length === 4)
  check('devfest staff see no atrium claims', (await select('claims', devfest)).rows.length === 0)
  check('staff see no profiles', (await select('profiles', atrium)).rows.length === 0)

  // Search RPC is API-only
  check('claimant cannot call search_items RPC', (await rpc('search_items', sara, { what_text: 'bag' })) >= 400)
  check('anon cannot call search_items RPC', (await rpc('search_items', null, { what_text: 'bag' })) >= 400)

  // Writes are API-only
  const write = await fetch(`${URL_}/rest/v1/items?id=eq.17e00000-0000-4000-8000-000000000001`, {
    method: 'PATCH',
    headers: { apikey: ANON, Authorization: `Bearer ${atrium}`, 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ title: 'Hacked title' }),
  })
  const written = write.ok ? await write.json() : []
  check('staff cannot write items directly', written.length === 0, `status ${write.status}`)

  // Search works for the service role (what Flask uses)
  const sres = await fetch(`${URL_}/rest/v1/rpc/search_items`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: JSON.stringify({ what_text: 'black bag', where_text: 'atrium mall' }),
  }).then((r) => r.json())
  check('"black bag in atrium mall" finds the seeded backpack first', sres[0]?.title === 'Black backpack', sres.map((r: any) => r.title).slice(0, 3).join(', '))

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll RLS checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error('✖', e.message)
  process.exit(1)
})
