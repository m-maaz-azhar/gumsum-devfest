/** "Found 2 days ago" / short form "2d ago". */
export function foundAgo(iso: string, short = false): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (short) {
    if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`
    if (h < 24) return `${h}h ago`
    return `${d}d ago`
  }
  if (m < 60) return m <= 1 ? 'just now' : `${m} minutes ago`
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`
  return d === 1 ? '1 day ago' : `${d} days ago`
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const km = (d: number | null) => (d == null ? null : d < 1 ? `${(d * 1000).toFixed(0)} m` : `${d.toFixed(1)} km`)
