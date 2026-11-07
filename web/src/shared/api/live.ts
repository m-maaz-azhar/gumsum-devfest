// Live updates. Real mode: Supabase Realtime on `claims` (RLS-protected). Mock mode: an in-page event bus.
// Either way, a change invalidates the affected TanStack queries.
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { USE_MOCK_API } from '../../config'
import { supabase } from '../supabase'

type Listener = () => void
const listeners = new Set<Listener>()

/** Called by the mock API whenever claims or items change. */
export function emitMockChange() {
  for (const l of listeners) l()
}

export function useLiveClaims(enabled: boolean, keyPrefixes: string[][]) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    const invalidate = () => keyPrefixes.forEach((k) => qc.invalidateQueries({ queryKey: k }))
    if (USE_MOCK_API) {
      listeners.add(invalidate)
      return () => void listeners.delete(invalidate)
    }
    const channel = supabase
      .channel(`claims-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, invalidate)
      .subscribe()
    return () => void supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, qc, JSON.stringify(keyPrefixes)])
}
