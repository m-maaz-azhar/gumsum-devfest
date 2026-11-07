// parse_query fallback (ARCHITECTURE §6.3): split "what" and "where" on " in | at | near ".

export function parseQuery(q: string): { what: string | null; where: string | null } {
  const text = q.trim().replace(/\s+/g, ' ')
  const lead = text.match(/^(?:in|at|near)\s+(.+)$/i) // "in Atrium Mall": a place with no item
  if (lead) return { what: null, where: lead[1].replace(/^the\s+/i, '').trim() || null }
  const parts = text.split(/\s+(?:in|at|near)\s+/i)
  if (parts.length < 2) return { what: text || null, where: null }
  const where = parts.pop()!.replace(/^the\s+/i, '').trim()
  const what = parts.join(' ').trim()
  return { what: what || null, where: where || null }
}

const BLOCKED = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'cunt', 'motherfucker', 'dick', 'slut', 'whore']

/** Stand-in for the OpenAI moderation endpoint (§6.6). */
export function isFlagged(text: string): boolean {
  const t = text.toLowerCase()
  return BLOCKED.some((w) => new RegExp(`\\b${w}`).test(t))
}
