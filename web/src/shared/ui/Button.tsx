import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import clsx from 'clsx'
import { springSnappy } from '../motion/presets'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant
  loading?: boolean
  children: ReactNode
  full?: boolean
}

export const Spinner = ({ className }: { className?: string }) => (
  <svg className={clsx('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

const styles: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink disabled:bg-line disabled:text-ink-3',
  secondary: 'bg-paper text-ink border border-ink disabled:border-line disabled:text-ink-3',
  danger: 'bg-paper text-danger border border-line',
  ghost: 'bg-fill text-ink',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', loading, disabled, children, className, full = true, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={springSnappy}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'relative inline-flex h-[52px] items-center justify-center gap-2 rounded-button px-5 text-callout transition-colors select-none',
        full && 'w-full',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </motion.button>
  )
})

export function TextButton({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx('min-h-[44px] text-callout text-ink underline-offset-4 hover:underline focus-visible:underline disabled:text-ink-3', className)}
      {...p}
    />
  )
}

export function IconButton({ label, className, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('inline-flex h-11 w-11 items-center justify-center rounded-full text-ink active:scale-95 transition-transform', className)}
      {...p}
    >
      {children}
    </button>
  )
}
