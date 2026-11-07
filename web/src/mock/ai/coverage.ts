// Mock stand-in for the coverage and scoring models (ARCHITECTURE §6.4, §6.5).
// The real API asks OpenAI; this heuristic keeps the same inputs and outputs so the UI behaves identically.
import { GENERIC_WORDS, normalise, tokens, wordsMatch } from './text'
import type { Rationale, Verdict } from './score'

function keywords(detail: string) {
  return tokens(detail).filter((t) => t.length >= 2 && !GENERIC_WORDS.has(t))
}

/** Fraction of a detail's keywords found in the claimant's text. */
export function detailCoverage(detail: string, text: string): number {
  const kw = keywords(detail)
  if (!kw.length) return 0
  const said = tokens(text)
  const hit = kw.filter((k) => said.some((s) => wordsMatch(s, k))).length
  return hit / kw.length
}

type Kind = 'contents' | 'marks' | 'attached' | 'other'

export function detailKind(detail: string): Kind {
  const d = normalise(detail)
  if (/\b(keychain|keyring|tag|strap|attached|charm|pouch|lanyard)\b/.test(d)) return 'attached'
  if (/\b(scratch|dent|stain|crack|cracked|chip|torn|broken|bent|missing|sticker|logo|patch|engraved|stitch|stitching|stitched|sketch|initials|written|polka|bow|carved|embroidered|size|lock screen)\b/.test(d)) return 'marks'
  if (/\b(inside|contains|pocket|receipt|card|photo|tucked)\b/.test(d)) return 'contents'
  return 'other'
}

const QUESTION_FOR: Record<Kind, string> = {
  contents: 'Is there anything inside it?',
  marks: 'Any marks, stickers or damage?',
  attached: 'Anything attached to it?',
  other: 'Is there anything else that makes it yours?',
}

export interface CoverageResult {
  covered: number[]
  uncovered: number[]
  next_question: string | null
}

export function coverage(details: string[], userText: string, alreadyAsked: string[]): CoverageResult {
  const covered: number[] = []
  const uncovered: number[] = []
  details.forEach((d, i) => (detailCoverage(d, userText) >= 0.5 ? covered : uncovered).push(i))
  const candidates = uncovered.map((i) => QUESTION_FOR[detailKind(details[i])]).filter((q) => !alreadyAsked.includes(q))
  return { covered, uncovered, next_question: candidates[0] ?? null }
}

const NEGATIONS: Record<Kind, RegExp> = {
  contents: /\b(nothing|empty)\b.*\b(inside|in it)\b|\bnothing inside\b|\bit was empty\b/,
  marks: /\bno (marks|scratches|damage|stickers)\b|\bbrand new\b|\bno marks at all\b/,
  attached: /\bnothing (was )?attached\b|\bno (keychain|keyring|tag)\b/,
  other: /$^/,
}

export function scoreModel(details: string[], userText: string, hasProof: boolean, publicWords: string[]): Rationale {
  const text = normalise(userText)
  const rows = details.map((d, idx) => {
    const c = detailCoverage(d, userText)
    let verdict: Verdict = c >= 0.67 ? 'match' : c >= 0.34 ? 'partial' : 'none'
    if (verdict === 'none' && NEGATIONS[detailKind(d)].test(text)) verdict = 'contradiction'
    const evidence =
      verdict === 'match' ? `describes "${d}"` : verdict === 'partial' ? `partly describes "${d}"` : verdict === 'contradiction' ? 'says the opposite' : 'not mentioned'
    return { idx, verdict, evidence }
  })
  const mentionsPublic = publicWords.some((w) => tokens(text).some((t) => wordsMatch(t, normalise(w))))
  const matched = rows.filter((r) => r.verdict === 'match').length
  return {
    details: rows,
    photo_consistency: mentionsPublic ? 'consistent' : 'unclear',
    proof_photo: hasProof ? 'supports' : 'none',
    summary: `${matched} of ${details.length} private details matched${rows.some((r) => r.verdict === 'contradiction') ? '; contradictions found' : ''}.`,
  }
}
