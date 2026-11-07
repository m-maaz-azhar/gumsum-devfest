import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronRight, ListChecks } from 'lucide-react'
import { useMyClaims } from '../shared/api/hooks'
import { Page } from '../shared/ui/Page'
import { StatusChip } from '../shared/ui/Chip'
import { EmptyState, ErrorLine, Skeleton } from '../shared/ui/Layout'
import { shortDate } from '../shared/time'
import { springSnappy } from '../shared/motion/presets'

export default function Requests() {
  const claims = useMyClaims()
  return (
    <Page kind="tab" withNav>
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-title">Requests</h1>
      </header>
      {claims.isPending ? (
        <div className="space-y-3 px-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : claims.isError ? (
        <ErrorLine message="Couldn’t load your requests." onRetry={() => claims.refetch()} />
      ) : claims.data.claims.length === 0 ? (
        <EmptyState icon={ListChecks} title="No requests yet." body="Found something that’s yours? Tap ‘This is mine’ on the item." />
      ) : (
        <ul className="px-5">
          {claims.data.claims.map((c) => (
            <motion.li key={c.id} whileTap={{ scale: 0.98 }} transition={springSnappy}>
              <Link to={`/requests/${c.id}`} className="flex items-center gap-3 border-b border-line py-3" aria-label={`${c.item.title}, ${c.status.replace('_', ' ')}`}>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-input bg-fill">
                  {c.item.thumb_url && <img src={c.item.thumb_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-callout font-semibold">{c.item.title}</p>
                  <p className="truncate text-caption text-ink-3">
                    {c.item.location_name} · {shortDate(c.created_at)}
                  </p>
                </div>
                <StatusChip claim={c.status} small />
                <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </Page>
  )
}
