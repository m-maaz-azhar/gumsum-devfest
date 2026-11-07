import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapPin, Search, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useStaffItems } from '../shared/api/hooks'
import { Page } from '../shared/ui/Page'
import { Chip } from '../shared/ui/Chip'
import { ItemCard, ItemGridSkeleton } from '../shared/ui/ItemCard'
import { EmptyState, ErrorLine } from '../shared/ui/Layout'
import { Sheet } from '../shared/ui/Sheet'
import { Button, IconButton } from '../shared/ui/Button'

const STATUSES = [
  { v: '', label: 'All' },
  { v: 'available', label: 'Available' },
  { v: 'claim_pending', label: 'Claim pending' },
  { v: 'ready_for_pickup', label: 'Ready for pickup' },
  { v: 'returned', label: 'Returned' },
  { v: 'archived', label: 'Archived' },
]

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

export default function StaffItems() {
  const nav = useNavigate()
  const { me } = useAuth()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const locationId = params.get('location') ?? ''
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 300)
  const [locOpen, setLocOpen] = useState(false)
  const items = useStaffItems({ status: status || undefined, location_id: locationId || undefined, q: dq || undefined })
  const sentinel = useRef<HTMLDivElement>(null)
  const locations = me?.role === 'staff' ? me.locations : []
  const locName = locations.find((l) => l.id === locationId)?.name

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && items.hasNextPage && !items.isFetchingNextPage && items.fetchNextPage())
    io.observe(el)
    return () => io.disconnect()
  }, [items])

  const list = items.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Page kind="tab" withNav>
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="text-title">Items</h1>
      </header>
      <div className="sticky top-0 z-20 bg-paper/95 pt-3 pb-2 backdrop-blur">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <Chip key={s.v} active={status === s.v} onClick={() => setParam('status', s.v)}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 px-5">
          <div className="flex h-11 flex-1 items-center gap-2 rounded-full border-[1.5px] border-transparent bg-fill pr-1 pl-4 transition-colors focus-within:border-ink">
            <Search size={18} className="text-ink-2" aria-hidden />
            <input
              type="search"
              value={q}
              maxLength={100}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title or tags"
              aria-label="Search items"
              className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <IconButton label="Clear search" className="!h-9 !w-9" onClick={() => setQ('')}>
                <X size={16} />
              </IconButton>
            )}
          </div>
          <Chip active={!!locationId} onClick={() => setLocOpen(true)}>
            <MapPin size={14} aria-hidden /> {locName ?? 'Place'}
          </Chip>
        </div>
      </div>

      <div className="px-5 pt-3">
        {items.isPending ? (
          <ItemGridSkeleton count={6} />
        ) : items.isError ? (
          <ErrorLine message="Couldn’t load items." onRetry={() => items.refetch()} />
        ) : list.length === 0 ? (
          status || dq || locationId ? (
            <EmptyState title="No items match." body="Try another filter." />
          ) : (
            <EmptyState title="No items yet." body="Add your first found item." action={<Button onClick={() => nav('/staff/add')}>Add found item</Button>} />
          )
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {list.map((i) => (
              <ItemCard key={i.id} item={i} staff to={`/staff/items/${i.id}`} />
            ))}
          </div>
        )}
        <div ref={sentinel} className="h-8" />
        {items.isFetchingNextPage && <ItemGridSkeleton count={2} />}
      </div>

      <Sheet open={locOpen} onClose={() => setLocOpen(false)} label="Choose a place">
        <div className="px-5 pt-2 pb-5">
          <h2 className="mb-3 text-title">Place</h2>
          <ul>
            {[{ id: '', name: 'All places' }, ...locations].map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => (setParam('location', l.id), setLocOpen(false))}
                  className="flex min-h-[52px] w-full items-center justify-between border-b border-line text-left text-body"
                  aria-pressed={locationId === l.id}
                >
                  {l.name}
                  {locationId === l.id && <span className="text-callout">Selected</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </Page>
  )
}
