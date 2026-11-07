import { SERVICE_KEY, SUPABASE_URL } from './helpers'

const E2E_ITEM_TITLES = ['Purple umbrella hat']

/** Remove throwaway e2e-* claimants (their claims cascade) and items the staff tests published. */
export default async function teardown() {
  if (process.env.E2E_KEEP) return // keep data for debugging
  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' }
  const { users } = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: h }).then((r) => r.json())
  for (const u of users ?? []) {
    if (/^e2e-.*@claimant\.gumsum\.test$/.test(u.email)) await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: h })
  }
  for (const title of E2E_ITEM_TITLES) {
    const items: { id: string }[] = await fetch(`${SUPABASE_URL}/rest/v1/items?select=id&title=eq.${encodeURIComponent(title)}`, { headers: h }).then((r) => r.json())
    for (const it of items) {
      const imgs: { path: string }[] = await fetch(`${SUPABASE_URL}/rest/v1/item_images?select=path&item_id=eq.${it.id}`, { headers: h }).then((r) => r.json())
      if (imgs.length) await fetch(`${SUPABASE_URL}/storage/v1/object/item-photos`, { method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: imgs.map((i) => i.path) }) })
      await fetch(`${SUPABASE_URL}/rest/v1/items?id=eq.${it.id}`, { method: 'DELETE', headers: h })
    }
  }
}
