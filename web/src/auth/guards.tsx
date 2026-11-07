import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button } from '../shared/ui/Button'
import { useAuth } from './AuthProvider'

export function Splash() {
  return (
    <div className="flex h-[100dvh] items-center justify-center" aria-busy="true" aria-label="Loading">
      <span className="h-10 w-10 rounded-full border-[3px] border-ink" aria-hidden style={{ animation: 'dot-pulse 1.2s infinite ease-in-out' }} />
    </div>
  )
}

function AccountError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 px-8 text-center">
      <p className="text-body">Couldn’t load your account. Try again.</p>
      <div className="w-full max-w-[280px]">
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </div>
  )
}

/** Hiding a screen is never the security boundary (the API is); this only routes each role home. */
export function RequireRole({ role, children }: { role: 'staff' | 'claimant'; children: ReactNode }) {
  const { session, ready, me, meLoading, meError, refetchMe } = useAuth()
  const location = useLocation()
  if (!ready) return <Splash />
  if (!session) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />
  if (meLoading) return <Splash />
  if (meError || !me) return <AccountError onRetry={refetchMe} />
  if (me.role !== role) return <Navigate to={me.role === 'staff' ? '/staff' : '/'} replace />
  if (me.role === 'claimant' && me.needs_onboarding) return <Navigate to="/onboarding/name" replace />
  return <>{children}</>
}

/** Onboarding routes need a signed-in claimant. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session, ready, me, meLoading, meError, refetchMe } = useAuth()
  if (!ready) return <Splash />
  if (!session) return <Navigate to="/welcome" replace />
  if (meLoading) return <Splash />
  if (meError || !me) return <AccountError onRetry={refetchMe} />
  if (me.role === 'staff') return <Navigate to="/staff" replace />
  return <>{children}</>
}

/** Public routes (welcome, sign in) bounce signed-in users to their home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, ready, me } = useAuth()
  if (!ready) return <Splash />
  if (session && me) {
    if (me.role === 'staff') return <Navigate to="/staff" replace />
    return <Navigate to={me.needs_onboarding ? '/onboarding/name' : '/'} replace />
  }
  return <>{children}</>
}
