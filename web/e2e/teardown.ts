import { SERVICE_KEY, SUPABASE_URL } from './helpers'

/** Remove the throwaway e2e-* claimant accounts created during the run. */
export default async function teardown() {
  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  const { users } = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: h }).then((r) => r.json())
  for (const u of users ?? []) {
    if (/^e2e-.*@claimant\.gumsum\.test$/.test(u.email)) await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: h })
  }
}
