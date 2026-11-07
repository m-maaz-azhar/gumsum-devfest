// Leak check (ARCHITECTURE §6.4, decision D5). Code, not AI: a follow-up question is rejected if any
// keyword from a private detail (or a close match, Levenshtein ≤ 1) appears in it.
import { GENERIC_WORDS, levenshtein, tokens } from './text'

export const FALLBACK_QUESTIONS = [
  'Is there anything inside it?',
  'Any marks, stickers or damage?',
  'Anything attached to it?',
  'Where and when do you think you lost it?',
] as const

export function detailKeywords(details: string[]): string[] {
  const out = new Set<string>()
  for (const d of details) for (const t of tokens(d)) if (t.length >= 3 && !GENERIC_WORDS.has(t)) out.add(t)
  return [...out]
}

/** True when the question would reveal a private detail. */
export function leaks(question: string, details: string[]): boolean {
  const keywords = detailKeywords(details)
  const qTokens = tokens(question).filter((t) => t.length >= 3)
  return qTokens.some((q) => keywords.some((k) => q === k || (Math.min(q.length, k.length) >= 4 && levenshtein(q, k) <= 1)))
}

/** Returns a question that is safe to show: the candidate if it passes, otherwise an unused generic fallback. */
export function safeQuestion(candidate: string | null, details: string[], alreadyAsked: string[]): string {
  if (candidate && !leaks(candidate, details) && !alreadyAsked.includes(candidate)) return candidate
  return FALLBACK_QUESTIONS.find((q) => !alreadyAsked.includes(q)) ?? FALLBACK_QUESTIONS[0]
}
