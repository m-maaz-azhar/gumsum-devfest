import { motion } from 'motion/react'
import clsx from 'clsx'
import { Check, Clock, Eye, Minus, Package, X } from 'lucide-react'
import type { ClaimStatus, ItemStatus } from '../api/types'
import { springSnappy } from '../motion/presets'

interface ChipProps {
  children: React.ReactNode
  onRemove?: () => void
  dotted?: boolean
  active?: boolean
  onClick?: () => void
  title?: string
  removeLabel?: string
}

export function Chip({ children, onRemove, dotted, active, onClick, title, removeLabel }: ChipProps) {
  const Comp = onClick ? motion.button : motion.span
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? !!active : undefined}
      whileTap={onClick ? { scale: 0.95 } : undefined}
      transition={springSnappy}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-callout whitespace-nowrap',
        active ? 'bg-ink text-on-ink' : 'bg-paper text-ink border',
        !active && (dotted ? 'border-dashed border-ink-3' : 'border-line'),
        onClick && 'min-h-[32px]',
      )}
    >
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel ?? 'Remove'} className="-mr-2 ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full">
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </Comp>
  )
}

const CLAIM: Record<ClaimStatus, { label: string; icon: typeof Clock; style: 'outline' | 'solid' | 'fill' }> = {
  submitted: { label: 'Submitted', icon: Clock, style: 'outline' },
  under_review: { label: 'Under review', icon: Eye, style: 'outline' },
  approved: { label: 'Approved', icon: Check, style: 'solid' },
  not_selected: { label: 'Not selected', icon: Minus, style: 'fill' },
  rejected: { label: 'Rejected', icon: Minus, style: 'fill' },
  collected: { label: 'Collected', icon: Package, style: 'solid' },
  withdrawn: { label: 'Withdrawn', icon: Minus, style: 'fill' },
}

const ITEM: Record<ItemStatus, { label: string; icon: typeof Clock; style: 'outline' | 'solid' | 'fill' }> = {
  available: { label: 'Available', icon: Eye, style: 'outline' },
  claim_pending: { label: 'Claim pending', icon: Clock, style: 'outline' },
  ready_for_pickup: { label: 'Ready for pickup', icon: Check, style: 'solid' },
  returned: { label: 'Returned', icon: Package, style: 'solid' },
  archived: { label: 'Archived', icon: Minus, style: 'fill' },
}

export const claimStatusLabel = (s: ClaimStatus) => CLAIM[s].label
export const itemStatusLabel = (s: ItemStatus) => ITEM[s].label

/** Monochrome status chip: fill and icon, never colour alone (DESIGN §4, §9). */
export function StatusChip({ claim, item, small }: { claim?: ClaimStatus; item?: ItemStatus; small?: boolean }) {
  const spec = claim ? CLAIM[claim] : ITEM[item!]
  const Icon = spec.icon
  return (
    <motion.span
      key={spec.label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full whitespace-nowrap',
        small ? 'h-6 px-2 text-caption' : 'h-7 px-2.5 text-caption font-medium',
        spec.style === 'solid' && 'bg-ink text-on-ink',
        spec.style === 'outline' && 'border border-ink/80 bg-paper text-ink',
        spec.style === 'fill' && 'bg-fill text-ink-2',
      )}
    >
      <Icon size={small ? 12 : 13} strokeWidth={2.25} aria-hidden />
      {spec.label}
    </motion.span>
  )
}
