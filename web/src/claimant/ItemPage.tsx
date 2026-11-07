import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Clock, MapPin, Store, X } from 'lucide-react'
import { useItem } from '../shared/api/hooks'
import { Button, IconButton } from '../shared/ui/Button'
import { BackButton, EmptyState, Skeleton } from '../shared/ui/Layout'
import { Tooltip } from '../shared/ui/Tooltip'
import { Page } from '../shared/ui/Page'
import { foundAgo } from '../shared/time'
import type { ImageRef } from '../shared/api/types'
import { ClaimSheet } from './ClaimSheet'

export function Carousel({ itemId, images, title }: { itemId: string; images: ImageRef[]; title: string }) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <motion.div layoutId={`photo-${itemId}`} className="relative aspect-square overflow-hidden rounded-card bg-fill">
        <div
          ref={ref}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          aria-roledescription="carousel"
          aria-label={`${title} photos`}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className="h-full w-full shrink-0 snap-center"
              onClick={() => setZoom(img.url)}
              aria-label={`Photo ${i + 1} of ${images.length}, open full screen`}
            >
              <img src={img.url} alt="" className="h-full w-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {images.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full bg-white shadow transition-all ${i === index ? 'w-4 opacity-100' : 'w-1.5 opacity-60'}`} />
            ))}
          </div>
        )}
      </motion.div>
      <AnimatePresence>
        {zoom && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Photo"
          >
            <div className="h-full w-full overflow-auto" style={{ touchAction: 'pinch-zoom' }}>
              <img src={zoom} alt={title} className="mx-auto h-full w-full object-contain" />
            </div>
            <IconButton label="Close photo" onClick={() => setZoom(null)} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-3 bg-white/15 !text-white">
              <X size={22} />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default function ItemPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const item = useItem(id)
  const [claimOpen, setClaimOpen] = useState(false)

  if (item.isError)
    return (
      <Page>
        <div className="px-2 pt-safe"><BackButton /></div>
        <EmptyState title="This item is no longer listed." />
      </Page>
    )

  const d = item.data
  const claimable = d && (d.status === 'available' || d.status === 'claim_pending')
  const myClaim = d?.my_claim && d.my_claim.chat_done ? d.my_claim : null

  return (
    <Page className="pb-[calc(96px+env(safe-area-inset-bottom))]">
      <div className="relative px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {d ? <Carousel itemId={d.id} images={d.images} title={d.title} /> : <Skeleton className="aspect-square !rounded-card" />}
        <div className="absolute top-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))] left-5">
          <BackButton floating />
        </div>
      </div>
      <div className="px-5 pt-5">
        {!d ? (
          <>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="mt-3 h-4 w-1/2" />
          </>
        ) : (
          <>
            <h1 className="text-title">{d.title}</h1>
            <ul className="mt-3 space-y-2 text-callout font-normal text-ink-2">
              <li className="flex items-start gap-2">
                <MapPin size={18} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
                <span>
                  {d.location.name}
                  {d.exact_spot && ` · ${d.exact_spot}`}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Clock size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
                Found {foundAgo(d.found_at)}
              </li>
              <li className="flex items-center gap-2">
                <Store size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
                Desk: {d.location.desk_hours}
              </li>
            </ul>
            {d.colours.length + (d.category ? 1 : 0) > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {[d.category, ...d.colours].filter(Boolean).map((t) => (
                  <span key={t} className="rounded-full bg-fill px-3 py-1 text-caption capitalize">{t}</span>
                ))}
              </div>
            )}
            {!claimable && !myClaim && <p className="mt-6 rounded-input bg-fill px-4 py-3 text-callout font-normal">This item has been returned to its owner.</p>}
          </>
        )}
      </div>

      {d && (claimable || myClaim) && (
        <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 border-t border-line bg-paper/90 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px]">
          {myClaim ? (
            <Button variant="secondary" onClick={() => nav(`/requests/${myClaim.id}`)}>View my request</Button>
          ) : (
            <div className="flex items-center gap-3">
              <Button onClick={() => setClaimOpen(true)}>This is mine</Button>
              <Tooltip text="You’ll answer a few questions to prove it’s yours." align="right" />
            </div>
          )}
        </div>
      )}
      {d && <ClaimSheet open={claimOpen} onClose={() => setClaimOpen(false)} item={d} />}
    </Page>
  )
}
