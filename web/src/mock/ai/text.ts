// Small text utilities shared by the mock AI: tokenising, Levenshtein and pg_trgm-style similarity.

export const STOPWORDS = new Set(
  `a an the and or but if of to in on at by for with from into onto over under near about as is are was were be been
  being it its it's this that these those there here my your our their his her me you we they i he she them us
  do does did have has had can could would should will shall may might must just very really so too also not no yes
  any anything something some one ones what which who whom whose when where why how all each every both few more most
  other such only own same than then once again ever still like think maybe sure know dont don't im i'm`
    .split(/\s+/)
    .filter(Boolean),
)

/** Category words that describe the kind of detail, not the detail itself. Safe in neutral questions. */
export const GENERIC_WORDS = new Set(
  `inside attached attach marks mark stickers sticker damage damaged side back front top bottom small little tiny
  big large left right item thing things part corner usually kept`.split(/\s+/).filter(Boolean),
)

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  return normalise(s).split(' ').filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Loose word match used for coverage: exact, Levenshtein ≤ 1 for longer words, or a shared 5-letter stem. */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= 1) return true
  if (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5)) return true
  return false
}

// ---- pg_trgm-compatible similarity -------------------------------------------------------

function trigrams(s: string): Set<string> {
  const out = new Set<string>()
  for (const w of normalise(s).split(' ').filter(Boolean)) {
    const padded = `  ${w} `
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  }
  return out
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a)
  const B = trigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/** Best similarity between `needle` and any run of consecutive words in `haystack` (like word_similarity). */
export function wordSimilarity(needle: string, haystack: string): number {
  const words = normalise(haystack).split(' ').filter(Boolean)
  const n = Math.max(1, normalise(needle).split(' ').filter(Boolean).length)
  let best = 0
  for (let size = 1; size <= Math.min(words.length, n + 1); size++) {
    for (let i = 0; i + size <= words.length; i++) {
      best = Math.max(best, similarity(needle, words.slice(i, i + size).join(' ')))
    }
  }
  return best
}
