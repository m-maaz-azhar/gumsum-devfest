import type { Transition } from 'motion/react'

// DESIGN.md §3.1
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 35 }
export const springSmooth: Transition = { type: 'spring', stiffness: 260, damping: 30 }
export const easeOut: Transition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
export const easeIn: Transition = { duration: 0.18, ease: [0.4, 0, 1, 1] }

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported (iOS) */
  }
}
