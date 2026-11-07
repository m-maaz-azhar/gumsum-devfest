import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import clsx from 'clsx'
import { springSmooth } from '../motion/presets'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
  height?: 'auto' | 'tall'
  dismissible?: boolean
  className?: string
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Bottom sheet: slides up with spring-smooth, drag down to dismiss, 40% backdrop, focus trap, Esc closes. */
export function Sheet({ open, onClose, children, label, height = 'auto', dismissible = true, className }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useDragControls()

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    }, 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose()
      if (e.key === 'Tab' && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        if (!els.length) return
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onClose, dismissible])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissible ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={clsx(
              'absolute bottom-0 flex w-full max-w-[480px] flex-col rounded-t-card bg-paper shadow-float pb-safe',
              height === 'tall' ? 'h-[92dvh]' : 'max-h-[92dvh]',
              className,
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
            transition={springSmooth}
            drag={dismissible ? 'y' : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
          >
            <div className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1" onPointerDown={(e) => dismissible && drag.start(e)}>
              <span className="h-[5px] w-9 rounded-full bg-line" aria-hidden />
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
