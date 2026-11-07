import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../shared/supabase'
import { useMe } from '../shared/api/hooks'
import type { Me } from '../shared/api/types'
import { USE_MOCK_API } from '../config'

interface AuthCtx {
  session: Session | null
  ready: boolean
  me: Me | undefined
  meLoading: boolean
  meError: unknown
  refetchMe: () => void
  signOut: () => Promise<void>
  /** Set when the session ended on its own (expired refresh token). */
  expired: boolean
  clearExpired: () => void
}

const Ctx = createContext<AuthCtx | null>(null)
export const useAuth = () => useContext(Ctx)!

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const manualSignOut = useRef(false)
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession((prev) => {
        if (event === 'SIGNED_OUT' && prev && !manualSignOut.current) setExpired(true)
        if (prev?.user.id !== s?.user.id) qc.clear()
        return s
      })
      manualSignOut.current = false
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  const meQuery = useMe(!!session)

  const signOut = useCallback(async () => {
    manualSignOut.current = true
    await supabase.auth.signOut()
    if (USE_MOCK_API) (await import('../mock/server')).clearMockCaches()
    qc.clear()
  }, [qc])

  return (
    <Ctx.Provider
      value={{
        session,
        ready,
        me: meQuery.data,
        meLoading: !!session && meQuery.isPending,
        meError: meQuery.error,
        refetchMe: () => void meQuery.refetch(),
        signOut,
        expired,
        clearExpired: () => setExpired(false),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
