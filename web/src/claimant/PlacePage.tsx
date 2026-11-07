import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'motion/react'
import { Clock, MapPin } from 'lucide-react'
import { usePlaces } from '../shared/api/hooks'
import { useUserLocation } from '../shared/location'
import { Page } from '../shared/ui/Page'
import { BackButton, EmptyState, Skeleton } from '../shared/ui/Layout'
import { SearchBox } from './SearchPage'
import { SearchResults } from './SearchResults'

/** USR-SRCH-03: place screen with desk hours and its items; search scoped to the place. */
export default function PlacePage() {
  const { id = '' } = useParams()
  const { loc } = useUserLocation()
  const places = usePlaces(loc)
  const place = places.data?.places.find((p) => p.id === id)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const { scrollY } = useScroll()
  const headerScale = useTransform(scrollY, [0, 120], [1, 0.92])
  const headerOpacity = useTransform(scrollY, [0, 120], [1, 0.4])

  return (
    <Page withNav>
      <div className="sticky top-0 z-20 bg-paper/90 px-2 pt-safe backdrop-blur">
        <BackButton to="/" />
      </div>
      <div className="px-5">
        {places.isPending ? (
          <Skeleton className="h-24" />
        ) : !place ? (
          <EmptyState title="This place isn’t listed." />
        ) : (
          <>
            <motion.header style={{ scale: headerScale, opacity: headerOpacity }} className="origin-top-left">
              <h1 className="text-title">{place.name}</h1>
              <p className="mt-1 flex items-start gap-1.5 text-callout font-normal text-ink-2">
                <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden /> {place.address}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-callout font-normal text-ink-2">
                <Clock size={16} className="shrink-0" aria-hidden /> Desk: {place.desk_hours}
              </p>
            </motion.header>
            <div className="sticky top-[calc(48px+env(safe-area-inset-top))] z-10 -mx-5 mt-5 bg-paper px-5 py-2">
              <SearchBox value={draft} onChange={setDraft} onSubmit={() => setQ(draft.trim())} placeholder={`Search ${place.name}`} />
            </div>
            <div className="mt-3">
              <SearchResults q={q || 'in ' + place.name} loc={loc} locationId={place.id} onChangeQuery={(next) => (setDraft(next.startsWith('in ') ? '' : next), setQ(next.startsWith('in ') ? '' : next))} />
            </div>
          </>
        )}
      </div>
    </Page>
  )
}
