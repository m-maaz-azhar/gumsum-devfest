import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { MapPin, Search } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { usePlaces, useRecent } from '../shared/api/hooks'
import { useAuth } from '../auth/AuthProvider'
import { useUserLocation } from '../shared/location'
import { Page } from '../shared/ui/Page'
import { ItemCard, ItemGridSkeleton } from '../shared/ui/ItemCard'
import { EmptyState, ErrorLine, Skeleton } from '../shared/ui/Layout'
import { PullToRefresh } from '../shared/ui/Pull'
import { km } from '../shared/time'
import { springSnappy } from '../shared/motion/presets'
import { InstallBanner } from './InstallBanner'

export const PLACEHOLDERS = ['Black bag in Atrium Mall', 'AirPods at the food court', 'Blue water bottle']

export function useRotatingPlaceholder() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PLACEHOLDERS.length), 3000)
    return () => clearInterval(t)
  }, [])
  return PLACEHOLDERS[i]
}

export function SearchPill({ to = '/search' }: { to?: string }) {
  const nav = useNavigate()
  const placeholder = useRotatingPlaceholder()
  return (
    <motion.button
      layoutId="search-bar"
      type="button"
      onClick={() => nav(to)}
      className="flex h-12 w-full items-center gap-3 rounded-full bg-fill px-4 text-left text-body text-ink-3"
      aria-label="Search for your item"
    >
      <Search size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
      <span className="relative h-6 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={placeholder} className="absolute inset-0 truncate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {placeholder}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  )
}

export default function Home() {
  const { me } = useAuth()
  const { loc, enabled } = useUserLocation()
  const places = usePlaces(loc)
  const recent = useRecent(loc)
  const qc = useQueryClient()
  const firstName = me?.role === 'claimant' ? me.profile?.full_name?.split(' ')[0] : null

  return (
    <Page kind="tab" withNav>
      <PullToRefresh onRefresh={() => Promise.all([qc.invalidateQueries({ queryKey: ['places'] }), qc.invalidateQueries({ queryKey: ['items'] })])}>
        <div className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <h1 className="text-title">{firstName ? `Hi ${firstName}` : 'Hi there'}</h1>
          <div className="mt-4">
            <SearchPill />
          </div>
          <InstallBanner />
        </div>

        <section className="mt-7" aria-labelledby="nearby">
          <h2 id="nearby" className="px-5 text-callout font-semibold">
            {enabled && loc ? 'Nearby places' : 'Choose a place'}
          </h2>
          {places.isError ? (
            <ErrorLine message="Couldn’t load places." onRetry={() => places.refetch()} />
          ) : (
            <div className="no-scrollbar mt-3 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-1">
              {places.isPending
                ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] w-[148px] shrink-0 !rounded-card" />)
                : places.data.places.map((p) => (
                    <motion.div key={p.id} whileTap={{ scale: 0.97 }} transition={springSnappy} className="snap-start">
                      <Link to={`/places/${p.id}`} className="flex h-[104px] w-[148px] shrink-0 flex-col justify-between rounded-card border border-line p-4">
                        <span className="line-clamp-2 text-callout font-semibold">{p.name}</span>
                        <span className="text-caption text-ink-3">
                          {p.distance_km != null && (
                            <span className="flex items-center gap-1">
                              <MapPin size={12} aria-hidden /> {km(p.distance_km)}
                            </span>
                          )}
                          <span className="tabular">
                            {p.available_count} {p.available_count === 1 ? 'item' : 'items'}
                          </span>
                        </span>
                      </Link>
                    </motion.div>
                  ))}
            </div>
          )}
        </section>

        <section className="mt-7 px-5" aria-labelledby="recent">
          <h2 id="recent" className="text-callout font-semibold">
            Recently found
          </h2>
          <div className="mt-3">
            {recent.isPending ? (
              <ItemGridSkeleton />
            ) : recent.isError ? (
              <ErrorLine message="Couldn’t load items." onRetry={() => recent.refetch()} />
            ) : recent.data.items.length === 0 ? (
              <EmptyState title="No items yet" body="Items are added all the time, so check back soon." />
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                {recent.data.items.map((i) => (
                  <ItemCard key={i.id} item={i} to={`/items/${i.id}`} />
                ))}
              </div>
            )}
          </div>
        </section>
      </PullToRefresh>
    </Page>
  )
}
