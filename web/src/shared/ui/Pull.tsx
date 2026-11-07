import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

/** Pull to refresh: a thin black arc fills as you pull, then rotates while loading (DESIGN §3.2). */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const [pull, setPull] = useState(0)
  const [loading, setLoading] = useState(false)
  const start = useRef<number | null>(null)
  const THRESHOLD = 72

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !loading) start.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return
      const d = e.touches[0].clientY - start.current
      setPull(d > 0 ? Math.min(110, d * 0.5) : 0)
    }
    const onEnd = async () => {
      if (start.current == null) return
      start.current = null
      if (pull >= THRESHOLD * 0.75) {
        setLoading(true)
        setPull(48)
        await onRefresh().catch(() => {})
        setLoading(false)
      }
      setPull(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [pull, loading, onRefresh])

  const progress = Math.min(1, pull / THRESHOLD)
  return (
    <>
      <div className="pointer-events-none flex justify-center overflow-hidden transition-[height]" style={{ height: pull }} aria-hidden={!loading}>
        <motion.svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          className="mt-3"
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={loading ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : { duration: 0 }}
          role={loading ? 'progressbar' : undefined}
          aria-label={loading ? 'Refreshing' : undefined}
        >
          <circle cx="14" cy="14" r="11" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${69 * (loading ? 0.3 : progress)} 69`} transform="rotate(-90 14 14)" />
        </motion.svg>
      </div>
      {children}
    </>
  )
}
