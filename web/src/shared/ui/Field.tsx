import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import clsx from 'clsx'
import { vibrate } from '../motion/presets'

/** Shake the field horizontally (6px, 3 cycles, 300ms) whenever `trigger` changes to a truthy value. */
export function useShake(trigger: unknown) {
  const controls = useAnimationControls()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!trigger) return
    vibrate(10)
    controls.start({ x: [0, -6, 6, -6, 6, -6, 0], transition: { duration: 0.3 } })
  }, [trigger, controls])
  return controls
}

export function FieldMessage({ id, error, helper }: { id: string; error?: string | null; helper?: ReactNode }) {
  return (
    <div id={id} className="mt-2 min-h-[18px] text-caption" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p key="e" className="text-danger" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {error}
          </motion.p>
        ) : helper ? (
          <motion.p key="h" className="text-ink-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {helper}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  helper?: ReactNode
  error?: string | null
  shakeKey?: unknown
  trailing?: ReactNode
  /** BigInput only: render without the message line (the caller shows it). */
  bare?: boolean
}

/** Standard input (DESIGN §4): 52px, --fill at rest, 1.5px ink border on focus. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, helper, error, shakeKey, trailing, className, id, ...rest }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  const controls = useShake(shakeKey)
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-2 flex items-center gap-1 text-caption text-ink-2">
          {label}
        </label>
      )}
      <motion.div animate={controls} className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={`${inputId}-msg`}
          className={clsx(
            'h-[52px] w-full rounded-input bg-fill px-4 text-body text-ink placeholder:text-ink-3 outline-none transition-colors',
            'border-[1.5px] border-transparent focus:border-ink focus:bg-paper',
            error && '!border-danger',
            trailing && 'pr-12',
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </motion.div>
      <FieldMessage id={`${inputId}-msg`} error={error} helper={helper} />
    </div>
  )
})

/** Big question input for step forms: 28px text over a 2px bottom line. */
export const BigInput = forwardRef<HTMLInputElement, InputProps>(function BigInput({ helper, error, shakeKey, className, id, label, bare, ...rest }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  const controls = useShake(shakeKey)
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="sr-only">{label}</label>}
      <motion.div animate={controls}>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={`${inputId}-msg`}
          className={clsx(
            'w-full border-0 border-b-2 bg-transparent pb-2 text-[1.75rem] leading-9 text-ink placeholder:text-ink-3/70 outline-none transition-colors rounded-none',
            error ? 'border-danger' : 'border-line focus:border-ink',
          )}
          {...rest}
        />
      </motion.div>
      {!bare && <FieldMessage id={`${inputId}-msg`} error={error} helper={helper} />}
    </div>
  )
})

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  helper?: ReactNode
  error?: string | null
  max?: number
  shakeKey?: unknown
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, helper, error, max, shakeKey, className, id, value, ...rest }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  const controls = useShake(shakeKey)
  const len = String(value ?? '').length
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-2 flex items-center gap-1 text-caption text-ink-2">
          {label}
        </label>
      )}
      <motion.div animate={controls}>
        <textarea
          ref={ref}
          id={inputId}
          value={value}
          aria-invalid={!!error || undefined}
          aria-describedby={`${inputId}-msg`}
          className={clsx(
            'min-h-[160px] w-full resize-none rounded-input bg-fill p-4 text-body text-ink placeholder:text-ink-3 outline-none',
            'border-[1.5px] border-transparent focus:border-ink focus:bg-paper',
            error && '!border-danger',
          )}
          {...rest}
        />
      </motion.div>
      <div className="flex items-start justify-between gap-3">
        <FieldMessage id={`${inputId}-msg`} error={error} helper={helper} />
        {max && <span className={clsx('mt-2 shrink-0 text-caption tabular', len > max ? 'text-danger' : 'text-ink-3')}>{len} / {max.toLocaleString()}</span>}
      </div>
    </div>
  )
})

/** Validate on blur, re-validate on change (DESIGN §5.1). */
export function useBlurValidation<V>(value: V, validate: (v: V) => string | null) {
  const [touched, setTouched] = useState(false)
  const error = touched ? validate(value) : null
  return { error, touch: () => setTouched(true), touched, reset: () => setTouched(false) }
}
