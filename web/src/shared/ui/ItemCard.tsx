import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { ItemCard as Card, StaffItemCard } from '../api/types'
import { springSnappy } from '../motion/presets'
import { foundAgo } from '../time'
import { StatusChip } from './Chip'
import { Skeleton } from './Layout'

/** 1:1 photo (20 radius), title, place · time. Shared element: the photo grows into the detail carousel. */
export function ItemCard({ item, to, staff }: { item: Card | StaffItemCard; to: string; staff?: boolean }) {
  const s = staff ? (item as StaffItemCard) : null
  return (
    <motion.div whileTap={{ scale: 0.97 }} transition={springSnappy}>
      <Link to={to} className="block" aria-label={`${item.title}, ${item.location.name}, found ${foundAgo(item.found_at)}`}>
        <div className="relative">
          <motion.div layoutId={`photo-${item.id}`} className="aspect-square overflow-hidden rounded-card bg-fill">
            {item.thumb_url && <img src={item.thumb_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
          </motion.div>
          {!staff && item.requested && (
            <span className="absolute top-2 left-2 rounded-full bg-paper px-2.5 py-1 text-caption font-medium text-ink shadow-float">Requested</span>
          )}
          {s && s.claim_count > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-paper px-2.5 py-1 text-caption font-medium tabular text-ink shadow-float">
              {s.claim_count} {s.claim_count === 1 ? 'claim' : 'claims'}
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-callout font-semibold">{item.title}</p>
        <p className="truncate text-caption text-ink-3">
          {item.location.name} · {foundAgo(item.found_at, true)}
        </p>
        {s && (
          <div className="mt-1.5">
            <StatusChip item={item.status} small />
          </div>
        )}
      </Link>
    </motion.div>
  )
}

export function ItemGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-square !rounded-card" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-1.5 h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
