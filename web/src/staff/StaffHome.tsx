import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { CheckCheck, ChevronRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useDashboard } from '../shared/api/hooks'
import { Page } from '../shared/ui/Page'
import { EmptyState, Skeleton } from '../shared/ui/Layout'
import { Tooltip } from '../shared/ui/Tooltip'
import { PullToRefresh } from '../shared/ui/Pull'
import { foundAgo } from '../shared/time'
import { springSnappy } from '../shared/motion/presets'

function Tile({ value, label, tip, to }: { value: string | number; label: string; tip?: string; to?: string }) {
  const body = (
    <>
      <p className="text-display tabular">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-caption text-ink-2">
        {label}
        {tip && <Tooltip text={tip} align="left" />}
      </p>
    </>
  )
  return to ? (
    <motion.div whileTap={{ scale: 0.97 }} transition={springSnappy}>
      <Link to={to} className="block rounded-card bg-fill p-4">{body}</Link>
    </motion.div>
  ) : (
    <div className="rounded-card bg-fill p-4">{body}</div>
  )
}

export default function StaffHome() {
  const { me } = useAuth()
  const dash = useDashboard()
  const qc = useQueryClient()
  const org = me?.role === 'staff' ? me.org.name : ''

  return (
    <Page kind="tab" withNav>
      <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ['staff'] })}>
        <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <p className="text-caption text-ink-3">{org} · Staff</p>
          <h1 className="text-title">Lost &amp; Found</h1>
        </header>

        <section className="mt-5 px-5" aria-label="Key numbers">
          {dash.isError ? (
            <p className="rounded-card bg-fill p-4 text-callout font-normal">
              Couldn’t load numbers.{' '}
              <button type="button" className="font-medium underline underline-offset-4" onClick={() => dash.refetch()}>Retry</button>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {dash.isPending ? (
                [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] !rounded-card" />)
              ) : (
                <>
                  <Tile value={dash.data.stats.available} label="Available" to="/staff/items?status=available" />
                  <Tile value={dash.data.stats.to_review} label="To review" />
                  <Tile value={dash.data.stats.ready_for_pickup} label="For pickup" to="/staff/items?status=ready_for_pickup" />
                  <Tile value={`${dash.data.stats.return_rate}%`} label="Return rate" tip="Share of logged items that went back to their owner." />
                </>
              )}
            </div>
          )}
          {dash.data && (
            <p className="mt-3 text-caption text-ink-3 tabular">
              {dash.data.stats.returned_7d} returned in the last 7 days
            </p>
          )}
        </section>

        <section className="mt-7 px-5" aria-labelledby="attention">
          <h2 id="attention" className="text-callout font-semibold">Needs attention</h2>
          {dash.isPending ? (
            <div className="mt-3 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : dash.data && dash.data.needs_attention.length === 0 ? (
            <EmptyState icon={CheckCheck} title="All caught up." body="No claims to review." />
          ) : (
            <ul className="mt-1">
              {dash.data?.needs_attention.map((n) => (
                <li key={n.item.id}>
                  <Link to={`/staff/items/${n.item.id}`} className="flex items-center gap-3 border-b border-line py-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-input bg-fill">
                      {n.item.thumb_url && <img src={n.item.thumb_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-callout font-semibold">{n.item.title}</p>
                      <p className="text-caption text-ink-3">Oldest claim {foundAgo(n.oldest_claim_at)}</p>
                    </div>
                    <span className="text-callout tabular">{n.open_claims} {n.open_claims === 1 ? 'claim' : 'claims'}</span>
                    <ChevronRight size={18} className="text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PullToRefresh>
    </Page>
  )
}
