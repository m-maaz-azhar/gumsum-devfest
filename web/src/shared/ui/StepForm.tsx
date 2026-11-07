import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, X } from 'lucide-react'
import { IconButton } from './Button'
import { springSmooth } from '../motion/presets'

/** Full-screen Typeform-style shell: back/close, progress bar, one question per screen, footer above the keyboard. */
export function StepShell({
  step,
  total,
  onBack,
  onClose,
  children,
  footer,
  stepKey,
}: {
  step: number
  total: number
  onBack?: () => void
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  stepKey: string
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper pt-safe">
      <div className="flex h-12 items-center gap-2 px-2">
        {onBack ? (
          <IconButton label="Back" onClick={onBack}>
            <ChevronLeft size={24} strokeWidth={1.75} />
          </IconButton>
        ) : (
          <span className="w-11" />
        )}
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step} aria-label={`Step ${step} of ${total}`}>
          <motion.div className="h-full origin-left rounded-full bg-ink" initial={false} animate={{ scaleX: step / total }} transition={springSmooth} />
        </div>
        {onClose ? (
          <IconButton label="Close" onClick={onClose}>
            <X size={22} strokeWidth={1.75} />
          </IconButton>
        ) : (
          <span className="w-11" />
        )}
      </div>
      <div className="relative flex-1 overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, y: -24, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
            className="px-5 pt-6 pb-6"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
      {footer && <div className="sticky bottom-0 bg-paper px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </div>
  )
}

export function StepTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-display">{children}</h1>
      {sub && <p className="mt-2 text-body text-ink-2">{sub}</p>}
    </div>
  )
}
