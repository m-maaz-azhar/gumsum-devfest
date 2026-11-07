import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { useShake } from './Field'

interface Props {
  length: number
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  error?: boolean
  shakeKey?: unknown
  disabled?: boolean
  autoFocus?: boolean
  label: string
}

/** N digit boxes with auto-advance; paste fills all; completes on the last digit (USR-ONB-02). */
export function OtpInput({ length, value, onChange, onComplete, error, shakeKey, disabled, autoFocus, label }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const controls = useShake(shakeKey)
  const digits = value.padEnd(length, ' ').slice(0, length).split('')

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, length - 1)]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
    refs.current[Math.min(clean.length, length - 1)]?.focus()
  }

  const compact = length > 6
  return (
    <motion.div animate={controls} role="group" aria-label={label} className={clsx('flex justify-between', compact ? 'gap-1.5' : 'gap-2')}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={length}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          value={d.trim()}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (!v) return
            if (v.length > 1) return set(value.slice(0, i) + v) // paste or autofill
            set((value.slice(0, i) + v + value.slice(i + 1)).slice(0, length))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              if (value[i]) onChange(value.slice(0, i) + value.slice(i + 1))
              else if (i > 0) {
                onChange(value.slice(0, i - 1) + value.slice(i))
                refs.current[i - 1]?.focus()
              }
            } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
          }}
          onPaste={(e) => {
            e.preventDefault()
            set(e.clipboardData.getData('text'))
          }}
          className={clsx(
            'h-14 min-w-0 flex-1 rounded-input bg-fill text-center text-title tabular text-ink outline-none caret-ink',
            compact ? 'max-w-[44px]' : 'max-w-[48px]',
            'border-[1.5px] border-transparent focus:border-ink focus:bg-paper',
            error && '!border-danger',
          )}
        />
      ))}
    </motion.div>
  )
}
