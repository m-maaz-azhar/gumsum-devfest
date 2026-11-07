import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { springSmooth } from '../motion/presets'

const Ctx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(Ctx)

/** Black pill, bottom centre above the nav, auto-hides after 3s, swipe to dismiss. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((msg: string) => {
    clearTimeout(timer.current)
    setToast({ id: Date.now(), msg })
    timer.current = setTimeout(() => setToast(null), 3000)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-5" style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              role="status"
              aria-live="polite"
              className="pointer-events-auto max-w-[440px] rounded-full bg-ink px-5 py-3 text-callout text-on-ink shadow-float"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
              transition={springSmooth}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, i) => Math.abs(i.offset.x) > 80 && setToast(null)}
            >
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
