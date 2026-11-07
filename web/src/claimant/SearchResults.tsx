import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MapPin } from 'lucide-react'
import { useSearch } from '../shared/api/hooks'
import { Chip } from '../shared/ui/Chip'
import { ItemCard, ItemGridSkeleton } from '../shared/ui/ItemCard'
import { EmptyState, ErrorLine } from '../shared/ui/Layout'
import { Tooltip } from '../shared/ui/Tooltip'
import type { LatLng } from '../shared/location'

/** Results grid with parsed chips and infinite scroll (USR-SRCH-01, 02). */
export function SearchResults({ q, loc, locationId, onChangeQuery }: { q: string; loc: LatLng | null; locationId?: string; onChangeQuery: (q: string) => void }) {
  const search = useSearch({ q, lat: loc?.lat, lng: loc?.lng, location_id: locationId }, q.trim().length >= 2)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && search.hasNextPage && !search.isFetchingNextPage) search.fetchNextPage()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [search])

  if (search.isPending) return <div className="mt-4"><ItemGridSkeleton /></div>
  if (search.isError) return <ErrorLine message="Couldn’t search. Pull to retry." onRetry={() => search.refetch()} />

  const parsed = search.data.pages[0].parsed
  const results = search.data.pages.flatMap((p) => p.results)
  return (
    <div>
      <div className="flex flex-wrap gap-2 pt-1" aria-label="Search terms">
        <AnimatePresence initial>
          {parsed.what && (
            <motion.span key={`w-${parsed.what}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.24 }}>
              <Chip onRemove={parsed.where ? () => onChangeQuery(`in ${parsed.where}`) : undefined} removeLabel={`Remove ${parsed.what}`}>
                <span className="capitalize-first">{parsed.what}</span>
              </Chip>
            </motion.span>
          )}
          {parsed.where && (
            <motion.span
              key={`p-${parsed.where}`}
              layout
              className="inline-flex items-center gap-1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.04 } }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Chip dotted={parsed.where_matched === false} onRemove={parsed.what ? () => onChangeQuery(parsed.what!) : undefined} removeLabel={`Remove ${parsed.where}`}>
                <MapPin size={14} aria-hidden /> {parsed.where}
              </Chip>
              {parsed.where_matched === false && <Tooltip text="We couldn’t find this place. Showing all places." />}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4">
        {results.length === 0 ? (
          <EmptyState title="No match yet." body="Items are added all the time, so check back soon." />
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {results.map((i) => (
              <ItemCard key={i.id} item={i} to={`/items/${i.id}`} />
            ))}
          </div>
        )}
        <div ref={sentinel} className="h-8" />
        {search.isFetchingNextPage && <ItemGridSkeleton count={2} />}
      </div>
    </div>
  )
}
