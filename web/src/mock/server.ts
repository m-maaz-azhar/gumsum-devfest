// Mock implementation of the Flask /v1 API (ARCHITECTURE §5), running in the browser.
// Auth is real (Supabase JWT session); staff role comes from the real staff_members table (RLS: own row).
// Everything else lives in IndexedDB. Switch to the real API by setting VITE_API_URL.
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../shared/supabase'
import { ApiError } from '../shared/api/client'
import { emitMockChange } from '../shared/api/live'
import type * as T from '../shared/api/types'
import { blobUrl, loadDb, putBlob, saveDb, uid, type MClaim, type MItem, type MockDb } from './db'
import { coverage, scoreModel } from './ai/coverage'
import { safeQuestion } from './ai/leak'
import { isFlagged, parseQuery } from './ai/parse'
import { computeScore } from './ai/score'
import { similarity, wordSimilarity } from './ai/text'

const FIRST_QUESTION = "Tell us why this is yours. Describe anything only the owner would know, like what's inside, marks or stickers."
const SUBMITTED = "Thanks, your request was submitted. The team will review it and we'll notify you."
const MAX_FOLLOWUPS = 2
const PICKUP_DAYS = 7
const SECRET = 'gumsum-mock-pickup-secret'
const OPEN: T.ClaimStatus[] = ['submitted', 'under_review']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()
const fail = (status: number, code: string, message: string, fields?: Record<string, string>): never => {
  throw new ApiError(status, { code, message, fields })
}

// ---------------------------------------------------------------- identity

interface Caller {
  id: string
  email: string
  staff: { org_id: string; display_name: string; org: T.Org } | null
}
const staffCache = new Map<string, Caller['staff']>()

async function caller(session: Session | null): Promise<Caller> {
  if (!session) fail(401, 'UNAUTHENTICATED', 'Please sign in again.')
  const { id, email = '' } = session!.user
  if (!staffCache.has(id)) {
    const { data, error } = await supabase
      .from('staff_members')
      .select('org_id, display_name, organizations(id, name, slug)')
      .eq('user_id', id)
      .maybeSingle()
    if (error) fail(503, 'UNAVAILABLE', 'Couldn’t load your account. Try again.')
    const org = (data?.organizations ?? null) as unknown as T.Org | null
    staffCache.set(id, data && org ? { org_id: data.org_id, display_name: data.display_name, org } : null)
  }
  return { id, email, staff: staffCache.get(id) ?? null }
}

const requireStaff = (c: Caller) => c.staff ?? fail(403, 'FORBIDDEN', 'Staff only.')
const requireClaimant = (c: Caller) => (c.staff ? fail(403, 'FORBIDDEN', 'Staff accounts can’t make claims.') : c)

// ---------------------------------------------------------------- helpers

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function hmac(s: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(s))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

/** The 6-digit code is derived from an HMAC, so it can be shown again without storing it in clear (§7.2). */
async function pickupCode(claimId: string, issuedAt: string) {
  const h = await hmac(`code.${claimId}.${issuedAt}`)
  return String(parseInt(h.slice(0, 12), 16) % 1_000_000).padStart(6, '0')
}
async function qrToken(claimId: string, expiresAt: string) {
  const exp = String(Math.floor(new Date(expiresAt).getTime() / 1000))
  return b64url(`${claimId}.${exp}.${await hmac(`${claimId}.${exp}`)}`)
}

function distanceKm(lat1: number | null | undefined, lng1: number | null | undefined, lat2: number, lng2: number) {
  if (lat1 == null || lng1 == null) return null
  const r = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

const searchDoc = (i: MItem) => [i.title, i.category ?? '', ...i.colours, ...i.tags].join(' ').toLowerCase()
const isPublic = (i: MItem) => i.status === 'available' || i.status === 'claim_pending'

async function imagesFor(db: MockDb, itemId: string): Promise<T.ImageRef[]> {
  const imgs = db.images.filter((x) => x.item_id === itemId).sort((a, b) => a.position - b.position)
  return Promise.all(imgs.map(async (x) => ({ id: x.id, url: (await blobUrl(x.path)) ?? '', thumb_url: (await blobUrl(x.path)) ?? '' })))
}

async function card(db: MockDb, i: MItem, me: string | null): Promise<T.ItemCard> {
  const cover = (await imagesFor(db, i.id))[0]
  const loc = db.locations.find((l) => l.id === i.location_id)!
  return {
    id: i.id, title: i.title, status: i.status, found_at: i.found_at, location: { id: loc.id, name: loc.name },
    cover_url: cover?.url ?? null, thumb_url: cover?.thumb_url ?? null,
    requested: !!me && db.claims.some((c) => c.item_id === i.id && c.claimant_id === me),
  }
}

function place(db: MockDb, l: MockDb['locations'][number], lat?: number | null, lng?: number | null): T.Place {
  return {
    id: l.id, name: l.name, address: l.address, lat: l.lat, lng: l.lng, desk_hours: l.desk_hours,
    distance_km: distanceKm(lat, lng, l.lat, l.lng),
    available_count: db.items.filter((i) => i.location_id === l.id && isPublic(i)).length,
  }
}

function audit(db: MockDb, org_id: string, actor_id: string | null, type: string, entity_id: string, data: Record<string, unknown> = {}) {
  db.audit.push({ id: uid(), org_id, actor_id, type, entity_id, data, created_at: now() })
}

function profileOf(db: MockDb, userId: string) {
  return db.profiles.find((p) => p.user_id === userId && !p.deleted_at) ?? null
}

async function commit() {
  await saveDb()
  emitMockChange()
}

// ---------------------------------------------------------------- validation (Validation Rules sheet)

const NAME_RE = /^[\p{L}][\p{L}\s'’-]{0,48}[\p{L}]$/u
const TITLE_MSG = 'Give the item a short name, like ‘Black backpack’.'

function validateItem(b: Partial<T.CreateItemRequest>, db: MockDb, orgId: string, partial = false) {
  const fields: Record<string, string> = {}
  if (!partial || b.title !== undefined) {
    const t = (b.title ?? '').trim()
    if (t.length < 3 || t.length > 60 || !/[\p{L}\p{N}]/u.test(t)) fields.title = TITLE_MSG
  }
  if (b.tags && (b.tags.length > 8 || b.tags.some((x) => x.length < 2 || x.length > 24))) fields.tags = 'Tags must be 2 to 24 characters.'
  if (!partial || b.location_id !== undefined) {
    if (!db.locations.some((l) => l.id === b.location_id && l.org_id === orgId)) fields.location_id = 'Choose where it was found.'
  }
  if (b.exact_spot && b.exact_spot.length > 80) fields.exact_spot = 'Keep it under 80 characters.'
  if (b.found_at && new Date(b.found_at).getTime() > Date.now() + 60_000) fields.found_at = 'Date can’t be in the future.'
  if (!partial || b.private_description !== undefined) {
    const p = (b.private_description ?? '').trim()
    if (p.length < 20 || p.length > 1000) fields.private_description = 'Add a few more details so we can verify the owner.'
  }
  if (!partial && (!b.image_paths || b.image_paths.length < 2 || b.image_paths.length > 6)) fields.image_paths = 'Add at least 2 photos.'
  if (Object.keys(fields).length) fail(422, 'VALIDATION', 'Check the highlighted fields.', fields)
}

/** Stand-in for the publish-time model that splits a description into atomic facts (§6.2). */
const splitDetails = (s: string) =>
  s.split(/[,;\n.]+|\band\b/).map((x) => x.trim()).filter((x) => x.length >= 3)

// ---------------------------------------------------------------- scoring (background job)

function queueScoring(claimId: string) {
  setTimeout(async () => {
    const db = await loadDb()
    const c = db.claims.find((x) => x.id === claimId)
    if (!c || !c.chat_done) return
    const item = db.items.find((i) => i.id === c.item_id)!
    const secret = db.secrets.find((s) => s.item_id === c.item_id)!
    const text = db.messages.filter((m) => m.claim_id === c.id && m.role === 'user').map((m) => m.content).join('\n')
    const rationale = scoreModel(secret.details, text, !!c.proof_image_path, [item.title, ...item.colours, ...item.tags, item.category ?? ''])
    const { score, label } = computeScore(rationale)
    Object.assign(c, { rationale, score, score_label: label, score_state: 'done', updated_at: now() })
    if (c.status === 'submitted') c.status = 'under_review'
    await commit()
  }, 2500)
}

/** Startup sweep (§6.5): re-queue claims whose scoring job was lost (e.g. the page reloaded mid-job). */
let swept = false
function sweepOnce(db: MockDb) {
  if (swept) return
  swept = true
  for (const c of db.claims) if (c.chat_done && c.score_state === 'pending') queueScoring(c.id)
}

// ---------------------------------------------------------------- routes

type Handler = (ctx: { db: MockDb; me: Caller; body: any; params: Record<string, string>; query: URLSearchParams }) => Promise<unknown>
const routes: [string, RegExp, Handler][] = []
function route(method: string, pattern: string, h: Handler) {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$')
  routes.push([method, re, h])
}

// ---- me
route('GET', '/me', async ({ db, me }) => {
  if (me.staff) {
    const locations = db.locations.filter((l) => l.org_id === me.staff!.org_id).map((l) => place(db, l))
    return { role: 'staff', user: { id: me.id, email: me.email }, staff: { display_name: me.staff.display_name }, org: me.staff.org, locations } satisfies T.Me
  }
  const p = profileOf(db, me.id)
  const profile: T.Profile | null = p
    ? { full_name: p.full_name, phone_e164: p.phone_e164, phone_verified: p.phone_verified, notify_push: p.notify_push, use_location: p.use_location }
    : null
  return { role: 'claimant', user: { id: me.id, email: me.email }, profile, needs_onboarding: !p?.full_name || !p?.phone_e164 } satisfies T.Me
})

route('PUT', '/me', async ({ db, me, body }) => {
  requireClaimant(me)
  const fields: Record<string, string> = {}
  if (body.full_name !== undefined && !NAME_RE.test(String(body.full_name).trim())) fields.full_name = 'Enter your name as it appears on your ID.'
  if (body.phone_e164 !== undefined && !/^\+[1-9]\d{6,14}$/.test(body.phone_e164)) fields.phone_e164 = 'Enter a valid phone number.'
  if (Object.keys(fields).length) fail(422, 'VALIDATION', 'Check the highlighted fields.', fields)
  let p = profileOf(db, me.id)
  if (!p) {
    p = { user_id: me.id, email: me.email, full_name: null, phone_e164: null, phone_verified: false, notify_push: false, use_location: false, deleted_at: null }
    db.profiles.push(p)
  }
  for (const k of ['full_name', 'phone_e164', 'notify_push', 'use_location'] as const) {
    if (body[k] !== undefined) (p as any)[k] = typeof body[k] === 'string' ? body[k].trim() : body[k]
  }
  await commit()
  return { full_name: p.full_name, phone_e164: p.phone_e164, phone_verified: p.phone_verified, notify_push: p.notify_push, use_location: p.use_location }
})

route('DELETE', '/me', async ({ db, me }) => {
  requireClaimant(me)
  for (const c of db.claims.filter((c) => c.claimant_id === me.id && (OPEN.includes(c.status) || c.status === 'approved' || !c.chat_done))) {
    c.status = 'withdrawn'
    c.updated_at = now()
  }
  const p = profileOf(db, me.id)
  if (p) Object.assign(p, { deleted_at: now(), full_name: null, phone_e164: null })
  await commit()
  return { ok: true }
})

// ---- places & items
route('GET', '/places', async ({ db, query }) => {
  const lat = query.get('lat') ? Number(query.get('lat')) : null
  const lng = query.get('lng') ? Number(query.get('lng')) : null
  const places = db.locations.map((l) => place(db, l, lat, lng))
  places.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9) || b.available_count - a.available_count)
  return { places }
})

route('GET', '/items/recent', async ({ db, me, query }) => {
  const lat = query.get('lat') ? Number(query.get('lat')) : null
  const lng = query.get('lng') ? Number(query.get('lng')) : null
  let items = db.items.filter(isPublic)
  if (lat != null && lng != null) {
    const near = new Set(db.locations.filter((l) => (distanceKm(lat, lng, l.lat, l.lng) ?? 0) <= 25).map((l) => l.id))
    const nearby = items.filter((i) => near.has(i.location_id))
    if (nearby.length) items = nearby
  }
  items = [...items].sort((a, b) => b.found_at.localeCompare(a.found_at)).slice(0, 20)
  return { items: await Promise.all(items.map((i) => card(db, i, me.id))) }
})

route('POST', '/search', async ({ db, me, body }) => {
  const q = String(body.q ?? '').trim()
  if (q.length < 2 || q.length > 100) fail(400, 'VALIDATION', 'Search must be 2 to 100 characters.', { q: 'Search must be 2 to 100 characters.' })
  const parsed = body.parsed_override ?? parseQuery(q)
  const what: string | null = parsed.what
  const where: string | null = parsed.where
  let locIds: Set<string> | null = null
  let whereMatched: boolean | null = null
  if (body.location_id) locIds = new Set([body.location_id])
  else if (where) {
    const matches = db.locations.filter(
      (l) => Math.max(similarity(where, l.name), similarity(where, l.address), wordSimilarity(where, l.name)) >= 0.3,
    )
    whereMatched = matches.length > 0
    if (matches.length) locIds = new Set(matches.map((l) => l.id))
  }
  const scored = db.items
    .filter((i) => isPublic(i) && (!locIds || locIds.has(i.location_id)))
    .map((i) => {
      const doc = searchDoc(i)
      const ks = what ? Math.max(similarity(what, doc), wordSimilarity(what, doc)) : 0
      const loc = db.locations.find((l) => l.id === i.location_id)!
      return { i, ks, dist: distanceKm(body.lat, body.lng, loc.lat, loc.lng) }
    })
    .filter((r) => !what || r.ks >= 0.3)
  const byDistance = body.lat != null && body.lng != null && !where
  scored.sort((a, b) => (byDistance ? (a.dist ?? 0) - (b.dist ?? 0) : 0) || b.ks - a.ks || b.i.found_at.localeCompare(a.i.found_at))
  const page = Number(body.page ?? 0)
  const slice = scored.slice(page * 20, page * 20 + 20)
  return {
    parsed: { what, where, where_matched: whereMatched },
    results: await Promise.all(slice.map((r) => card(db, r.i, me.id))),
    next_page: scored.length > (page + 1) * 20 ? page + 1 : null,
  } satisfies T.SearchResponse
})

route('GET', '/items/:id', async ({ db, me, params }) => {
  const i = db.items.find((x) => x.id === params.id)
  if (!i || i.status === 'archived') fail(404, 'NOT_FOUND', 'This item is no longer listed.')
  const loc = db.locations.find((l) => l.id === i!.location_id)!
  const mine = db.claims.find((c) => c.item_id === i!.id && c.claimant_id === me.id)
  // Explicit allow-list: never spread the item, never touch secrets.
  return {
    id: i!.id, title: i!.title, category: i!.category, colours: i!.colours, tags: i!.tags, exact_spot: i!.exact_spot,
    found_at: i!.found_at, status: i!.status,
    location: { id: loc.id, name: loc.name, address: loc.address, desk_hours: loc.desk_hours, lat: loc.lat, lng: loc.lng },
    images: await imagesFor(db, i!.id),
    my_claim: mine ? { id: mine.id, status: mine.status, chat_done: mine.chat_done } : null,
  } satisfies T.ItemPublic
})

// ---- claims
async function botTurn(db: MockDb, c: MClaim): Promise<T.ClaimTurn> {
  const secret = db.secrets.find((s) => s.item_id === c.item_id)!
  const text = db.messages.filter((m) => m.claim_id === c.id && m.role === 'user').map((m) => m.content).join('\n')
  const cov = coverage(secret.details, text, c.asked)
  let reply: string
  let done = false
  if (cov.uncovered.length === 0 || c.followups_asked >= MAX_FOLLOWUPS) {
    done = true
    reply = SUBMITTED
    Object.assign(c, { chat_done: true, status: 'submitted', submitted_at: now(), score_state: 'pending' })
    const item = db.items.find((i) => i.id === c.item_id)!
    if (item.status === 'available') item.status = 'claim_pending'
    audit(db, item.org_id, c.claimant_id, 'claim_submitted', c.id)
    queueScoring(c.id)
  } else {
    reply = safeQuestion(cov.next_question, secret.details, c.asked)
    c.asked.push(reply)
    c.followups_asked += 1
  }
  db.messages.push({ id: uid(), claim_id: c.id, role: 'bot', content: reply, created_at: now() })
  c.updated_at = now()
  await commit()
  await sleep(700)
  return { claim_id: c.id, reply, done, followups_left: done ? 0 : MAX_FOLLOWUPS - c.followups_asked }
}

route('POST', '/claims', async ({ db, me, body }) => {
  requireClaimant(me)
  const message = String(body.message ?? '').trim()
  if (message.length < 15 || message.length > 1000) fail(422, 'VALIDATION', 'Add a bit more detail.', { message: 'Add a bit more detail.' })
  if (isFlagged(message)) fail(422, 'MODERATION', 'Please keep it respectful.')
  const item = db.items.find((i) => i.id === body.item_id)
  if (!item || !isPublic(item)) fail(403, 'NOT_CLAIMABLE', 'This item can’t be claimed right now.')
  const existing = db.claims.find((c) => c.item_id === item!.id && c.claimant_id === me.id)
  if (existing) fail(403, 'ALREADY_CLAIMED', existing.status === 'rejected' ? 'You can’t claim this item again.' : 'You already have a request for this item.')
  const dayAgo = Date.now() - 86_400_000
  if (db.claimLog.filter((l) => l.user_id === me.id && new Date(l.at).getTime() > dayAgo).length >= 5)
    fail(429, 'RATE_LIMITED', 'You’ve reached today’s limit. Try again tomorrow.')
  db.claimLog.push({ user_id: me.id, at: now() })
  const c: MClaim = {
    id: uid(), item_id: item!.id, claimant_id: me.id, status: 'submitted', chat_done: false, followups_asked: 0, asked: [],
    score: null, score_label: null, score_state: 'pending', rationale: null, proof_image_path: null, reject_reason: null,
    reject_note: null, submitted_at: null, created_at: now(), updated_at: now(),
  }
  db.claims.push(c)
  db.messages.push({ id: uid(), claim_id: c.id, role: 'bot', content: FIRST_QUESTION, created_at: now() })
  db.messages.push({ id: uid(), claim_id: c.id, role: 'user', content: message, created_at: now() })
  return botTurn(db, c)
})

route('POST', '/claims/:id/messages', async ({ db, me, body, params }) => {
  const c = db.claims.find((x) => x.id === params.id && x.claimant_id === me.id) ?? fail(404, 'NOT_FOUND', 'Request not found.')
  if (c.chat_done) return { claim_id: c.id, reply: null, done: true, followups_left: 0 } satisfies T.ClaimTurn
  const message = String(body.message ?? '').trim()
  if (message.length < 1 || message.length > 500) fail(422, 'VALIDATION', 'Add a short answer.', { message: 'Add a short answer.' })
  if (isFlagged(message)) fail(422, 'MODERATION', 'Please keep it respectful.')
  db.messages.push({ id: uid(), claim_id: c.id, role: 'user', content: message, created_at: now() })
  return botTurn(db, c)
})

route('POST', '/claims/:id/proof-upload-url', async ({ db, me, params }) => {
  const c = db.claims.find((x) => x.id === params.id && x.claimant_id === me.id) ?? fail(404, 'NOT_FOUND', 'Request not found.')
  const path = `proofs/${c.id}/${uid()}.jpg`
  c.proof_image_path = path
  await commit()
  return { path, token: 'mock', signed_url: `mock://${path}` } satisfies T.SignedUpload
})

route('GET', '/claims', async ({ db, me }) => {
  const mine = db.claims.filter((c) => c.claimant_id === me.id && c.chat_done).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const claims: T.MyClaim[] = await Promise.all(
    mine.map(async (c) => {
      const i = db.items.find((x) => x.id === c.item_id)!
      const cover = (await imagesFor(db, i.id))[0]
      return {
        id: c.id, status: c.status, chat_done: c.chat_done, created_at: c.created_at, updated_at: c.updated_at,
        item: { id: i.id, title: i.title, cover_url: cover?.url ?? null, thumb_url: cover?.thumb_url ?? null, location_name: db.locations.find((l) => l.id === i.location_id)!.name },
      }
    }),
  )
  return { claims }
})

route('GET', '/claims/:id/pickup', async ({ db, me, params }) => {
  const c = db.claims.find((x) => x.id === params.id && x.claimant_id === me.id) ?? fail(404, 'NOT_FOUND', 'Request not found.')
  const p = db.pickups.find((x) => x.claim_id === c.id)
  if (!p || (c.status !== 'approved' && c.status !== 'collected')) fail(403, 'NOT_APPROVED', 'This request hasn’t been approved.')
  const i = db.items.find((x) => x.id === c.item_id)!
  const loc = db.locations.find((l) => l.id === i.location_id)!
  return {
    claim_id: c.id, code: await pickupCode(c.id, p!.issued_at), qr_token: await qrToken(c.id, p!.expires_at), expires_at: p!.expires_at,
    collected_at: p!.collected_at, item: { id: i.id, title: i.title, cover_url: (await imagesFor(db, i.id))[0]?.url ?? null },
    location: { name: loc.name, address: loc.address, desk_hours: loc.desk_hours, lat: loc.lat, lng: loc.lng },
  } satisfies T.PickupInfo
})

route('POST', '/push/subscribe', async () => ({ ok: true }))
route('DELETE', '/push/subscribe', async () => ({ ok: true }))

// ---- staff
route('GET', '/staff/dashboard', async ({ db, me }) => {
  const s = requireStaff(me)
  const items = db.items.filter((i) => i.org_id === s.org_id)
  const ids = new Set(items.map((i) => i.id))
  const open = db.claims.filter((c) => ids.has(c.item_id) && c.chat_done && OPEN.includes(c.status))
  const weekAgo = Date.now() - 7 * 86_400_000
  const returned = items.filter((i) => i.status === 'returned')
  const byItem = new Map<string, MClaim[]>()
  for (const c of open) byItem.set(c.item_id, [...(byItem.get(c.item_id) ?? []), c])
  const needs = await Promise.all(
    [...byItem.entries()].map(async ([itemId, cs]) => {
      const i = items.find((x) => x.id === itemId)!
      return {
        item: { id: i.id, title: i.title, thumb_url: (await imagesFor(db, i.id))[0]?.thumb_url ?? null },
        open_claims: cs.length,
        oldest_claim_at: cs.map((c) => c.submitted_at ?? c.created_at).sort()[0],
      }
    }),
  )
  needs.sort((a, b) => a.oldest_claim_at.localeCompare(b.oldest_claim_at))
  return {
    stats: {
      available: items.filter(isPublic).length,
      to_review: open.length,
      ready_for_pickup: items.filter((i) => i.status === 'ready_for_pickup').length,
      returned_7d: returned.filter((i) => i.returned_at && new Date(i.returned_at).getTime() > weekAgo).length,
      return_rate: items.length ? Math.round((returned.length / items.length) * 100) : 0,
    },
    needs_attention: needs,
  } satisfies T.DashboardResponse
})

route('POST', '/staff/uploads', async ({ me, body }) => {
  requireStaff(me)
  const files: { name?: string; type?: string }[] = body.files ?? []
  return { uploads: files.map(() => ({ path: `items/${uid()}.jpg`, token: 'mock', signed_url: 'mock://upload' })) }
})

route('POST', '/staff/items/suggest', async ({ me }) => {
  requireStaff(me)
  await sleep(900)
  // The mock has no vision model: return empty fields, exactly like the documented failure fallback (§6.1).
  return { title: '', category: '', colours: [] } satisfies T.Suggestion
})

route('POST', '/staff/items', async ({ db, me, body }) => {
  const s = requireStaff(me)
  validateItem(body, db, s.org_id)
  const id = uid()
  const item: MItem = {
    id, org_id: s.org_id, location_id: body.location_id, title: body.title.trim(), category: body.category || null,
    colours: body.colours ?? [], tags: body.tags ?? [], exact_spot: body.exact_spot?.trim() || null,
    found_at: body.found_at || now(), status: 'available', archive_reason: null, created_by: me.id, created_at: now(), updated_at: now(), returned_at: null,
  }
  db.items.push(item)
  body.image_paths.forEach((path: string, n: number) => db.images.push({ id: uid(), item_id: id, path, position: n, is_cover: n === 0 }))
  db.secrets.push({ item_id: id, private_description: body.private_description.trim(), details: splitDetails(body.private_description) })
  audit(db, s.org_id, me.id, 'item_created', id)
  await commit()
  return { id }
})

route('GET', '/staff/items', async ({ db, me, query }) => {
  const s = requireStaff(me)
  const status = query.get('status')
  const loc = query.get('location_id')
  const q = (query.get('q') ?? '').trim().toLowerCase()
  const page = Number(query.get('page') ?? 0)
  let items = db.items.filter((i) => i.org_id === s.org_id)
  items = status ? items.filter((i) => i.status === status) : items.filter((i) => i.status !== 'archived')
  if (loc) items = items.filter((i) => i.location_id === loc)
  if (q) items = items.filter((i) => searchDoc(i).includes(q) || wordSimilarity(q, searchDoc(i)) >= 0.4)
  items.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const slice = items.slice(page * 24, page * 24 + 24)
  return {
    items: await Promise.all(
      slice.map(async (i) => ({ ...(await card(db, i, null)), claim_count: db.claims.filter((c) => c.item_id === i.id && c.chat_done).length })),
    ),
    next_page: items.length > (page + 1) * 24 ? page + 1 : null,
  } satisfies T.StaffItemsResponse
})

function staffItem(db: MockDb, orgId: string, id: string) {
  const i = db.items.find((x) => x.id === id && x.org_id === orgId)
  return i ?? fail(404, 'NOT_FOUND', 'Item not found.')
}

const actorName = (db: MockDb, me: Caller, id: string | null) =>
  !id ? null : id === me.id ? me.staff?.display_name ?? 'You' : db.profiles.find((p) => p.user_id === id)?.full_name ?? 'Staff'

route('GET', '/staff/items/:id', async ({ db, me, params }) => {
  const s = requireStaff(me)
  const i = staffItem(db, s.org_id, params.id)
  const loc = db.locations.find((l) => l.id === i.location_id)!
  return {
    id: i.id, title: i.title, category: i.category, colours: i.colours, tags: i.tags, exact_spot: i.exact_spot, found_at: i.found_at,
    status: i.status, archive_reason: i.archive_reason,
    location: { id: loc.id, name: loc.name, address: loc.address, desk_hours: loc.desk_hours, lat: loc.lat, lng: loc.lng },
    images: await imagesFor(db, i.id),
    private_description: db.secrets.find((x) => x.item_id === i.id)?.private_description ?? '',
    claim_count: db.claims.filter((c) => c.item_id === i.id && c.chat_done).length,
    timeline: db.audit
      .filter((a) => a.entity_id === i.id || db.claims.some((c) => c.item_id === i.id && c.id === a.entity_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((a) => ({ type: a.type, at: a.created_at, actor: actorName(db, me, a.actor_id), note: (a.data.reason as string) ?? null })),
  } satisfies T.StaffItem
})

route('PATCH', '/staff/items/:id', async ({ db, me, body, params }) => {
  const s = requireStaff(me)
  const i = staffItem(db, s.org_id, params.id)
  validateItem(body, db, s.org_id, true)
  for (const k of ['title', 'category', 'colours', 'tags', 'location_id', 'exact_spot', 'found_at'] as const) if (body[k] !== undefined) (i as any)[k] = body[k]
  if (body.private_description !== undefined) {
    const sec = db.secrets.find((x) => x.item_id === i.id)!
    sec.private_description = body.private_description.trim()
    sec.details = splitDetails(sec.private_description)
  }
  i.updated_at = now()
  audit(db, s.org_id, me.id, 'item_edited', i.id)
  await commit()
  return { id: i.id }
})

route('POST', '/staff/items/:id/archive', async ({ db, me, body, params }) => {
  const s = requireStaff(me)
  const i = staffItem(db, s.org_id, params.id)
  if (!['Donated', 'Disposed', 'Given to police', 'Other'].includes(body.reason)) fail(422, 'VALIDATION', 'Choose a reason.', { reason: 'Choose a reason.' })
  if (db.claims.some((c) => c.item_id === i.id && c.status === 'approved'))
    fail(409, 'ARCHIVE_BLOCKED', 'This item has an approved claim. Complete or cancel the pickup first.')
  Object.assign(i, { status: 'archived', archive_reason: body.reason, updated_at: now() })
  for (const c of db.claims.filter((c) => c.item_id === i.id && OPEN.includes(c.status))) c.status = 'not_selected'
  audit(db, s.org_id, me.id, 'item_archived', i.id, { reason: body.reason })
  await commit()
  return { ok: true }
})

route('GET', '/staff/items/:id/claims', async ({ db, me, params }) => {
  const s = requireStaff(me)
  const i = staffItem(db, s.org_id, params.id)
  const secret = db.secrets.find((x) => x.item_id === i.id)
  const claims = db.claims
    .filter((c) => c.item_id === i.id && c.chat_done)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
  return {
    claims: await Promise.all(
      claims.map(async (c) => {
        const p = db.profiles.find((x) => x.user_id === c.claimant_id)
        return {
          id: c.id, status: c.status, claimant: { name: p?.full_name ?? 'Deleted account', phone_last4: p?.phone_e164?.slice(-4) ?? null },
          score: c.score, score_label: c.score_label, score_state: c.score_state, rationale: c.rationale, details: secret?.details ?? [],
          submitted_at: c.submitted_at,
          messages: db.messages.filter((m) => m.claim_id === c.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(({ role, content, created_at }) => ({ role, content, created_at })),
          proof_url: c.proof_image_path ? await blobUrl(c.proof_image_path) : null, reject_reason: c.reject_reason,
        } satisfies T.StaffClaim
      }),
    ),
  }
})

function staffClaim(db: MockDb, orgId: string, id: string) {
  const c = db.claims.find((x) => x.id === id) ?? fail(404, 'NOT_FOUND', 'Claim not found.')
  const item = db.items.find((i) => i.id === c.item_id && i.org_id === orgId) ?? fail(404, 'NOT_FOUND', 'Claim not found.')
  return { c, item }
}

route('POST', '/staff/claims/:id/approve', async ({ db, me, params }) => {
  const s = requireStaff(me)
  const { c, item } = staffClaim(db, s.org_id, params.id)
  if (db.claims.some((x) => x.item_id === item.id && x.status === 'approved')) fail(409, 'ALREADY_APPROVED', 'This item already has an approved claim.')
  if (!OPEN.includes(c.status)) fail(409, 'NOT_OPEN', 'This claim is already closed.')
  c.status = 'approved'
  c.updated_at = now()
  item.status = 'ready_for_pickup'
  const issued = now()
  const expires = new Date(Date.now() + PICKUP_DAYS * 86_400_000).toISOString()
  db.pickups = db.pickups.filter((p) => p.claim_id !== c.id)
  db.pickups.push({ claim_id: c.id, code_hash: await sha256((await pickupCode(c.id, issued)) + c.id), issued_at: issued, expires_at: expires, collected_at: null, handed_over_by: null })
  for (const o of db.claims.filter((x) => x.item_id === item.id && x.id !== c.id && OPEN.includes(x.status))) {
    o.status = 'not_selected'
    o.updated_at = now()
  }
  audit(db, s.org_id, me.id, 'claim_approved', c.id)
  await commit()
  return { ok: true, expires_at: expires }
})

route('POST', '/staff/claims/:id/reject', async ({ db, me, body, params }) => {
  const s = requireStaff(me)
  const { c } = staffClaim(db, s.org_id, params.id)
  const reasons = ['Details don’t match', 'Item already returned', 'Suspected false claim', 'Other']
  if (!reasons.includes(body.reason)) fail(422, 'VALIDATION', 'Choose a reason.', { reason: 'Choose a reason.' })
  if (body.reason === 'Other' && (!body.note || body.note.trim().length < 5 || body.note.trim().length > 200))
    fail(422, 'VALIDATION', 'Add 5 to 200 characters.', { note: 'Add 5 to 200 characters.' })
  if (!OPEN.includes(c.status)) fail(409, 'NOT_OPEN', 'This claim is already closed.')
  Object.assign(c, { status: 'rejected', reject_reason: body.reason, reject_note: body.note ?? null, updated_at: now() })
  audit(db, s.org_id, me.id, 'claim_rejected', c.id, { reason: body.reason })
  await commit()
  return { ok: true }
})

route('POST', '/staff/claims/:id/rescore', async ({ db, me, params }) => {
  const s = requireStaff(me)
  const { c } = staffClaim(db, s.org_id, params.id)
  Object.assign(c, { score_state: 'pending', score: null, score_label: null })
  await commit()
  queueScoring(c.id)
  return { ok: true }
})

const verifyLog = new Map<string, number[]>()
route('POST', '/staff/pickups/verify', async ({ db, me, body }) => {
  const s = requireStaff(me)
  const recent = (verifyLog.get(me.id) ?? []).filter((t) => t > Date.now() - 60_000)
  if (recent.length >= 10) fail(429, 'RATE_LIMITED', 'Too many attempts. Wait a minute and try again.')
  verifyLog.set(me.id, [...recent, Date.now()])
  let claimId: string | null = null
  if (body.qr_token) {
    try {
      const [id, exp, sig] = unb64url(String(body.qr_token)).split('.')
      if (sig === (await hmac(`${id}.${exp}`))) claimId = id
    } catch {
      claimId = null
    }
  } else if (/^\d{6}$/.test(String(body.code ?? ''))) {
    for (const p of db.pickups) if (p.code_hash === (await sha256(body.code + p.claim_id))) claimId = p.claim_id
  }
  const invalid = () => fail(404, 'PICKUP_INVALID', 'That code doesn’t match any pickup.')
  if (!claimId) return invalid()
  const p = db.pickups.find((x) => x.claim_id === claimId)
  const c = db.claims.find((x) => x.id === claimId)
  const item = c && db.items.find((i) => i.id === c.item_id)
  if (!p || !c || !item || item.org_id !== s.org_id) return invalid()
  if (p.collected_at) fail(409, 'PICKUP_USED', 'This item was already collected.')
  if (new Date(p.expires_at).getTime() < Date.now()) fail(410, 'PICKUP_EXPIRED', 'This code expired. Approve the claim again to issue a new one.')
  const prof = db.profiles.find((x) => x.user_id === c.claimant_id)
  return {
    claim_id: c.id, claimant: { name: prof?.full_name ?? 'Unknown', phone_last4: prof?.phone_e164?.slice(-4) ?? null },
    item: { id: item.id, title: item.title, cover_url: (await imagesFor(db, item.id))[0]?.url ?? null }, expires_at: p.expires_at,
  } satisfies T.PickupPreview
})

route('POST', '/staff/pickups/:claimId/handover', async ({ db, me, params }) => {
  const s = requireStaff(me)
  const { c, item } = staffClaim(db, s.org_id, params.claimId)
  const p = db.pickups.find((x) => x.claim_id === c.id) ?? fail(404, 'PICKUP_INVALID', 'That code doesn’t match any pickup.')
  if (p.collected_at) fail(409, 'PICKUP_USED', 'This item was already collected.')
  Object.assign(p, { collected_at: now(), handed_over_by: me.id })
  Object.assign(c, { status: 'collected', updated_at: now() })
  Object.assign(item, { status: 'returned', returned_at: now(), updated_at: now() })
  audit(db, s.org_id, me.id, 'handed_over', item.id, { claim_id: c.id })
  await commit()
  return { ok: true }
})

// ---------------------------------------------------------------- entry points

export async function mockFetch<R>(method: string, fullPath: string, body: unknown, session: Session | null): Promise<R> {
  await sleep(120 + Math.random() * 180)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError(0, { code: 'NETWORK', message: 'Check your connection and try again.' })
  }
  const [path, search = ''] = fullPath.split('?')
  for (const [m, re, h] of routes) {
    if (m !== method) continue
    const match = path.match(re)
    if (!match) continue
    const db = await loadDb()
    sweepOnce(db)
    const me = await caller(session)
    return (await h({ db, me, body: body ?? {}, params: match.groups ?? {}, query: new URLSearchParams(search) })) as R
  }
  throw new ApiError(404, { code: 'NOT_FOUND', message: `No mock route for ${method} ${path}` })
}

/** Mock replacement for uploading to a Supabase signed URL. */
export async function mockUpload(path: string, file: Blob) {
  await sleep(250)
  await putBlob(path, file)
}

export function clearMockCaches() {
  staffCache.clear()
}
