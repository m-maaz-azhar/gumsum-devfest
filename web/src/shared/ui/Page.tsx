import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useNavigationType } from 'react-router-dom'
import clsx from 'clsx'
import { springSmooth } from '../motion/presets'

/**
 * Screen transition (DESIGN §3.2). Tabs cross-fade in 180ms with no sliding.
 * Going deeper slides in from the right (30%) with a fade; going back reveals the page from the left.
 */
export function Page({ kind = 'push', children, className, withNav }: { kind?: 'tab' | 'push'; children: ReactNode; className?: string; withNav?: boolean }) {
  const navType = useNavigationType()
  const initial = kind === 'tab' ? { opacity: 0 } : navType === 'POP' ? { opacity: 0, x: '-10%' } : { opacity: 0, x: '30%' }
  return (
    <motion.main
      initial={initial}
      animate={{ opacity: 1, x: 0 }}
      transition={kind === 'tab' ? { duration: 0.18 } : springSmooth}
      className={clsx('min-h-[100dvh]', withNav && 'pb-[calc(72px+env(safe-area-inset-bottom))]', className)}
    >
      {children}
    </motion.main>
  )
}
