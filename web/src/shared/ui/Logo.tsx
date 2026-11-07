/** Gumsum mark: a found-object ring with a dot, in ink. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="12" fill="var(--ink)" />
      <circle cx="22" cy="22" r="10" fill="none" stroke="var(--paper)" strokeWidth="4" />
      <path d="M29.5 29.5l7 7" stroke="var(--paper)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="22" cy="22" r="3" fill="var(--paper)" />
    </svg>
  )
}
