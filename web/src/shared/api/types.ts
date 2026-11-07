// The /v1 contract the PWA expects (ARCHITECTURE §5). The mock API implements exactly this,
// so switching VITE_API_URL to the Flask server needs no UI changes.

export type ItemStatus = 'available' | 'claim_pending' | 'ready_for_pickup' | 'returned' | 'archived'
export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'not_selected' | 'rejected' | 'collected' | 'withdrawn'
export type ScoreState = 'pending' | 'done' | 'failed'
export type ScoreLabel = 'High' | 'Medium' | 'Low'
export type Verdict = 'match' | 'partial' | 'none' | 'contradiction'

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> }
}

export interface Org {
  id: string
  name: string
  slug: string
}

export interface Profile {
  full_name: string | null
  phone_e164: string | null
  phone_verified: boolean
  notify_push: boolean
  use_location: boolean
}

export interface Place {
  id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  desk_hours: string
  distance_km: number | null
  available_count: number
}

export type Me =
  | { role: 'staff'; user: { id: string; email: string }; staff: { display_name: string }; org: Org; locations: Place[] }
  | { role: 'claimant'; user: { id: string; email: string }; profile: Profile | null; needs_onboarding: boolean }

export interface ImageRef {
  id: string
  url: string
  thumb_url: string
}

/** Public item card. Never contains secrets. */
export interface ItemCard {
  id: string
  title: string
  status: ItemStatus
  found_at: string
  location: { id: string; name: string }
  cover_url: string | null
  thumb_url: string | null
  requested: boolean
}

/** Public item detail (USR-ITEM-01). Never contains secrets. */
export interface ItemPublic {
  id: string
  title: string
  category: string | null
  colours: string[]
  tags: string[]
  exact_spot: string | null
  found_at: string
  status: ItemStatus
  location: { id: string; name: string; address: string; desk_hours: string; lat: number | null; lng: number | null }
  images: ImageRef[]
  my_claim: { id: string; status: ClaimStatus; chat_done: boolean } | null
}

export interface SearchRequest {
  q: string
  lat?: number
  lng?: number
  location_id?: string
  page?: number
}
export interface SearchResponse {
  parsed: { what: string | null; where: string | null; where_matched: boolean | null }
  results: ItemCard[]
  next_page: number | null
}

export interface ChatMessage {
  role: 'bot' | 'user'
  content: string
  created_at: string
}

export interface ClaimTurn {
  claim_id: string
  reply: string | null
  done: boolean
  followups_left: number
}

export interface MyClaim {
  id: string
  status: ClaimStatus
  chat_done: boolean
  created_at: string
  updated_at: string
  item: { id: string; title: string; cover_url: string | null; thumb_url: string | null; location_name: string }
}

export interface PickupInfo {
  claim_id: string
  code: string
  qr_token: string
  expires_at: string
  collected_at: string | null
  item: { id: string; title: string; cover_url: string | null }
  location: { name: string; address: string; desk_hours: string; lat: number | null; lng: number | null }
}

export interface SignedUpload {
  path: string
  token: string
  signed_url: string
}

// ---------------------------------------------------------------- staff

export interface DashboardResponse {
  stats: { available: number; to_review: number; ready_for_pickup: number; returned_7d: number; return_rate: number }
  needs_attention: { item: { id: string; title: string; thumb_url: string | null }; open_claims: number; oldest_claim_at: string }[]
}

export interface Suggestion {
  title: string
  category: string
  colours: string[]
}

export interface CreateItemRequest {
  title: string
  category?: string | null
  colours: string[]
  tags: string[]
  location_id: string
  exact_spot?: string | null
  found_at?: string | null
  private_description: string
  image_paths: string[]
}

export interface StaffItemCard extends ItemCard {
  claim_count: number
}

export interface StaffItemsResponse {
  items: StaffItemCard[]
  next_page: number | null
}

export interface TimelineEvent {
  type: string
  at: string
  actor: string | null
  note?: string | null
}

export interface StaffItem extends Omit<ItemPublic, 'my_claim'> {
  private_description: string
  claim_count: number
  archive_reason: string | null
  timeline: TimelineEvent[]
}

export interface StaffClaim {
  id: string
  status: ClaimStatus
  claimant: { name: string; phone_last4: string | null }
  score: number | null
  score_label: ScoreLabel | null
  score_state: ScoreState
  rationale: {
    details: { idx: number; verdict: Verdict; evidence: string }[]
    photo_consistency: 'consistent' | 'unclear' | 'inconsistent'
    proof_photo: string
    summary: string
  } | null
  details: string[]
  submitted_at: string | null
  messages: ChatMessage[]
  proof_url: string | null
  reject_reason: string | null
}

export interface PickupPreview {
  claim_id: string
  claimant: { name: string; phone_last4: string | null }
  item: { id: string; title: string; cover_url: string | null }
  expires_at: string
}

export type ArchiveReason = 'Donated' | 'Disposed' | 'Given to police' | 'Other'
export type RejectReason = 'Details don’t match' | 'Item already returned' | 'Suspected false claim' | 'Other'
