// In-browser data store for the mock API. Persists to IndexedDB so it survives reloads.
// Seeded from the same data.json the Supabase seed uses, so ids and content match the real database.
import { get, set, del, createStore } from 'idb-keyval'
import seed from '../shared/seed/data.json'
import { computeScore, type Rationale } from './ai/score'
import type { ClaimStatus, ItemStatus, ScoreState } from '../shared/api/types'

const store = createStore('gumsum-mock', 'kv')
const DB_KEY = 'db-v2'

export interface MLocation {
  id: string; org_id: string; slug: string; name: string; address: string; lat: number; lng: number; desk_hours: string
}
export interface MItem {
  id: string; org_id: string; location_id: string; title: string; category: string | null; colours: string[]; tags: string[]
  exact_spot: string | null; found_at: string; status: ItemStatus; archive_reason: string | null; created_by: string | null
  created_at: string; updated_at: string; returned_at: string | null
}
export interface MImage { id: string; item_id: string; path: string; position: number; is_cover: boolean }
export interface MSecret { item_id: string; private_description: string; details: string[] }
export interface MProfile {
  user_id: string; email: string; full_name: string | null; phone_e164: string | null; phone_verified: boolean
  notify_push: boolean; use_location: boolean; deleted_at: string | null
}
export interface MClaim {
  id: string; item_id: string; claimant_id: string; status: ClaimStatus; chat_done: boolean; followups_asked: number
  asked: string[]; score: number | null; score_label: 'High' | 'Medium' | 'Low' | null; score_state: ScoreState
  rationale: Rationale | null; proof_image_path: string | null; reject_reason: string | null; reject_note: string | null
  submitted_at: string | null; created_at: string; updated_at: string
}
export interface MMessage { id: string; claim_id: string; role: 'bot' | 'user'; content: string; created_at: string }
export interface MPickup {
  claim_id: string; code_hash: string; issued_at: string; expires_at: string; collected_at: string | null; handed_over_by: string | null
}
export interface MAudit { id: string; org_id: string; actor_id: string | null; type: string; entity_id: string; data: Record<string, unknown>; created_at: string }

export interface MockDb {
  organizations: { id: string; slug: string; name: string }[]
  locations: MLocation[]
  items: MItem[]
  images: MImage[]
  secrets: MSecret[]
  profiles: MProfile[]
  claims: MClaim[]
  messages: MMessage[]
  pickups: MPickup[]
  audit: MAudit[]
  claimLog: { user_id: string; at: string }[]
}

export const uid = () => crypto.randomUUID()
const hoursAgo = (h: number, now: number) => new Date(now - h * 3600_000).toISOString()

export function buildSeed(now = Date.now()): MockDb {
  const orgBySlug = Object.fromEntries(seed.organizations.map((o) => [o.slug, o.id]))
  const locations: MLocation[] = seed.locations.map(({ org, ...l }) => ({ ...l, org_id: orgBySlug[org] }))
  const locBySlug = Object.fromEntries(locations.map((l) => [l.slug, l]))
  const claimantId = (email: string) => `seed-${email.split('@')[0]}`
  const claimed = new Set(seed.claims.map((c) => c.item))

  const items: MItem[] = seed.items.map((i) => {
    const loc = locBySlug[i.location]
    return {
      id: i.id, org_id: loc.org_id, location_id: loc.id, title: i.title, category: i.category, colours: i.colours, tags: i.tags,
      exact_spot: i.exact_spot, found_at: hoursAgo(i.hours_ago, now), status: claimed.has(i.id) ? 'claim_pending' : 'available',
      archive_reason: null, created_by: null, created_at: hoursAgo(i.hours_ago, now), updated_at: hoursAgo(i.hours_ago, now), returned_at: null,
    }
  })
  const claims: MClaim[] = seed.claims.map((c) => {
    const { score, label } = computeScore(c.rationale as Rationale)
    const at = hoursAgo(c.hours_ago, now)
    return {
      id: c.id, item_id: c.item, claimant_id: claimantId(c.claimant), status: 'under_review', chat_done: true,
      followups_asked: c.followups_asked, asked: [], score, score_label: label, score_state: 'done', rationale: c.rationale as Rationale,
      proof_image_path: null, reject_reason: null, reject_note: null, submitted_at: at, created_at: at, updated_at: at,
    }
  })
  return {
    organizations: seed.organizations,
    locations,
    items,
    images: seed.items.flatMap((i) =>
      Array.from({ length: (i as { images?: number }).images ?? 2 }, (_, k) => k + 1).map((n) => ({ id: `${i.id}-${n}`, item_id: i.id, path: `seed/${i.image}-${n}.jpg`, position: n - 1, is_cover: n === 1 })),
    ),
    secrets: seed.items.map((i) => ({ item_id: i.id, private_description: i.private_description, details: i.details })),
    profiles: seed.claimants.map((c) => ({
      user_id: claimantId(c.email), email: c.email, full_name: c.full_name, phone_e164: c.phone_e164, phone_verified: false,
      notify_push: false, use_location: false, deleted_at: null,
    })),
    claims,
    messages: seed.claims.flatMap((c) =>
      c.messages.map(([role, content], k) => ({
        id: `${c.id}-${k}`, claim_id: c.id, role: role as 'bot' | 'user', content,
        created_at: new Date(now - c.hours_ago * 3600_000 + k * 30_000).toISOString(),
      })),
    ),
    pickups: [],
    audit: items.map((i) => ({ id: uid(), org_id: i.org_id, actor_id: null, type: 'item_created', entity_id: i.id, data: {}, created_at: i.created_at })),
    claimLog: [],
  }
}

let cache: MockDb | null = null
let loading: Promise<MockDb> | null = null

export async function loadDb(): Promise<MockDb> {
  if (cache) return cache
  if (!loading) {
    loading = (async () => {
      let db: MockDb | undefined
      try {
        db = await get<MockDb>(DB_KEY, store)
      } catch {
        db = undefined
      }
      cache = db ?? buildSeed()
      if (!db) await saveDb()
      return cache
    })()
  }
  return loading
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
export function saveDb(): Promise<void> {
  if (!cache) return Promise.resolve()
  if (saveTimer) clearTimeout(saveTimer)
  return new Promise((resolve) => {
    saveTimer = setTimeout(async () => {
      try {
        await set(DB_KEY, cache, store)
      } catch {
        /* storage blocked (private mode): keep working in memory */
      }
      resolve()
    }, 50)
  })
}

export async function resetDb() {
  cache = buildSeed()
  loading = Promise.resolve(cache)
  await set(DB_KEY, cache, store).catch(() => {})
}

// ---- photo blobs ------------------------------------------------------------------------

const urlCache = new Map<string, string>()

export async function putBlob(path: string, blob: Blob) {
  await set(`blob:${path}`, blob, store)
  urlCache.set(path, URL.createObjectURL(blob))
}

export async function blobUrl(path: string): Promise<string | null> {
  if (path.startsWith('seed/')) return `/${path}`
  if (urlCache.has(path)) return urlCache.get(path)!
  const blob = await get<Blob>(`blob:${path}`, store).catch(() => undefined)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(path, url)
  return url
}

export async function deleteBlob(path: string) {
  urlCache.delete(path)
  await del(`blob:${path}`, store).catch(() => {})
}
