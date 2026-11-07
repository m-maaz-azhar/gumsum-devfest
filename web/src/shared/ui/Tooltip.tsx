import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Info } from 'lucide-react'
import clsx from 'clsx'

/** (i) icon that opens a black popover on tap or hover. Closes on outside tap or Esc. Never hover-only. */
export function Tooltip({ text, label = 'More info', align = 'center', className }: { text: string; label?: string; align?: 'center' | 'right' | 'left'; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span ref={ref} className={clsx('relative inline-flex', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="-m-3.5 inline-flex h-11 w-11 items-center justify-center text-ink-3"
      >
        <Info size={16} strokeWidth={1.75} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16 }}
            className={clsx(
              'absolute bottom-full z-40 mb-3 w-max max-w-[260px] rounded-input bg-[#0a0a0a] px-3 py-2 text-left text-caption font-normal text-white shadow-float',
              align === 'center' && 'left-1/2 -translate-x-1/2',
              align === 'right' && 'right-0 -mr-2',
              align === 'left' && 'left-0 -ml-2',
            )}
          >
            {text}
            <span
              className={clsx(
                'absolute top-full h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-[#0a0a0a]',
                align === 'center' && 'left-1/2 -translate-x-1/2',
                align === 'right' && 'right-3',
                align === 'left' && 'left-3',
              )}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
