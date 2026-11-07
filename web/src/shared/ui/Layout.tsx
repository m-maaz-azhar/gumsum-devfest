import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, PackageSearch, WifiOff } from 'lucide-react'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { IconButton } from './Button'
import { useOnline } from '../useOnline'

export function BackButton({ to, floating, label = 'Back' }: { to?: string; floating?: boolean; label?: string }) {
  const nav = useNavigate()
  return (
    <IconButton
      label={label}
      onClick={() => (to ? nav(to) : window.history.length > 1 ? nav(-1) : nav('/'))}
      className={clsx(floating && 'bg-paper/90 shadow-float backdrop-blur')}
    >
      <ChevronLeft size={24} strokeWidth={1.75} />
    </IconButton>
  )
}

export function TopBar({ title, back, right, caption, heading = true }: { title?: ReactNode; back?: boolean | string; right?: ReactNode; caption?: ReactNode; heading?: boolean }) {
  const Title = heading ? 'h1' : 'p'
  return (
    <header className="sticky top-0 z-30 bg-paper/90 pt-safe backdrop-blur-[20px]">
      <div className="flex h-12 items-center gap-1 px-2">
        {back ? <BackButton to={typeof back === 'string' ? back : undefined} /> : <span className="w-3" />}
        <div className="min-w-0 flex-1">
          {caption && <p className="truncate text-caption text-ink-3">{caption}</p>}
          {title && <Title className="truncate text-callout font-semibold">{title}</Title>}
        </div>
        {right}
      </div>
    </header>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-input', className)} aria-hidden />
}

export function EmptyState({ title, body, action, icon: Icon = PackageSearch }: { title: string; body?: string; action?: ReactNode; icon?: typeof PackageSearch }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <Icon size={40} strokeWidth={1.25} className="text-ink-3" aria-hidden />
      <p className="mt-4 text-callout font-semibold">{title}</p>
      {body && <p className="mt-1 text-callout font-normal text-ink-3">{body}</p>}
      {action && <div className="mt-6 w-full max-w-[280px]">{action}</div>}
    </div>
  )
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p className="py-6 text-center text-callout font-normal text-ink-2">
      {message}{' '}
      {onRetry && (
        <button type="button" className="font-medium text-ink underline underline-offset-4" onClick={onRetry}>
          Retry
        </button>
      )}
    </p>
  )
}

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <motion.div
      initial={{ y: -40 }}
      animate={{ y: 0 }}
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-ink px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-caption text-on-ink"
    >
      <WifiOff size={14} aria-hidden /> You’re offline. Showing saved results.
    </motion.div>
  )
}

/** Animated success: circle draws, then the check, then the title fades in (400ms strokes). */
export function SuccessMark({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden>
      <motion.circle cx="36" cy="36" r="33" stroke="currentColor" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} />
      <motion.path
        d="M22 37l9 9 19-20"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  )
}

/** Typing indicator: three dots pulsing with 120ms offsets. */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 rounded-full bg-ink-3" style={{ animation: `dot-pulse 1.1s ${i * 0.12}s infinite ease-in-out` }} />
      ))}
    </span>
  )
}
