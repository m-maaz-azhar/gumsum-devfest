import { useEffect, useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Home, ListChecks, CircleUser } from 'lucide-react'
import { BottomNav } from '../shared/ui/BottomNav'
import { useMyClaims } from '../shared/api/hooks'
import { useLiveClaims } from '../shared/api/live'
import type { MyClaim } from '../shared/api/types'

const SEEN_KEY = 'gumsum:seen-statuses'
const readSeen = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
  } catch {
    return {}
  }
}
export const markClaimsSeen = (claims: MyClaim[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(claims.map((c) => [c.id, c.status]))))
  } catch {
    /* ignore */
  }
}

export default function ClaimantLayout() {
  const { pathname } = useLocation()
  const claims = useMyClaims()
  useLiveClaims(true, [['claims'], ['items']])

  const onRequests = pathname.startsWith('/requests')
  const list = claims.data?.claims
  useEffect(() => {
    if (onRequests && list) markClaimsSeen(list)
  }, [onRequests, list])

  // Dot badge when any status changed since the Requests tab was last opened (USR-REQ-01 #4).
  const badge = useMemo(() => {
    if (!list || onRequests) return false
    const seen = readSeen()
    // A claim the user hasn't seen on the Requests tab yet starts from its submitted state.
    return list.some((c) => (seen[c.id] ?? 'submitted') !== c.status)
  }, [list, onRequests])

  return (
    <>
      <Outlet />
      <BottomNav
        label="Main"
        tabs={[
          { to: '/', label: 'Home', icon: Home, end: true },
          { to: '/requests', label: 'Requests', icon: ListChecks, badge },
          { to: '/profile', label: 'Profile', icon: CircleUser },
        ]}
      />
    </>
  )
}
