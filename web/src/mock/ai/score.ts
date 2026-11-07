// Confidence score, computed in code from the model's per-detail verdicts (ARCHITECTURE §6.5, decision D6).
// Mirrors api/app/ai/score.py so the mock and the real API rank claims the same way.

export type Verdict = 'match' | 'partial' | 'none' | 'contradiction'
export type PhotoConsistency = 'consistent' | 'unclear' | 'inconsistent'
export type ProofPhoto = 'supports' | 'none' | 'unclear' | 'contradicts'

export interface Rationale {
  details: { idx: number; verdict: Verdict; evidence: string }[]
  photo_consistency: PhotoConsistency
  proof_photo: ProofPhoto
  summary: string
}

export type ScoreLabel = 'High' | 'Medium' | 'Low'

const VERDICT_VALUE: Record<Verdict, number> = { match: 1, partial: 0.5, none: 0, contradiction: -1 }
const PHOTO_VALUE: Record<PhotoConsistency, number> = { consistent: 1, unclear: 0.5, inconsistent: 0 }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function labelFor(score: number): ScoreLabel {
  if (score >= 75) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

export function computeScore(r: Rationale): { score: number; label: ScoreLabel } {
  const n = r.details.length
  const detailScore = n === 0 ? 0 : clamp(r.details.reduce((s, d) => s + VERDICT_VALUE[d.verdict], 0) / n, 0, 1)
  const photoScore = PHOTO_VALUE[r.photo_consistency]
  const proofBonus = r.proof_photo === 'supports' ? 0.05 : 0
  const raw = 0.75 * detailScore + 0.25 * photoScore + proofBonus
  let score = Math.round(100 * clamp(raw, 0, 1))
  if (r.details.some((d) => d.verdict === 'contradiction')) score = Math.min(score, 40)
  return { score, label: labelFor(score) }
}
