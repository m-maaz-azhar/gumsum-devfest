import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import { Clock, MapPin, Navigation, Package, X } from 'lucide-react'
import { useMyClaims, usePickup } from '../shared/api/hooks'
import { useLiveClaims } from '../shared/api/live'
import { Page } from '../shared/ui/Page'
import { TopBar, EmptyState, Skeleton, SuccessMark } from '../shared/ui/Layout'
import { StatusChip } from '../shared/ui/Chip'
import { Button, IconButton } from '../shared/ui/Button'
import { Tooltip } from '../shared/ui/Tooltip'
import { shortDate } from '../shared/time'
import type { ClaimStatus, PickupInfo } from '../shared/api/types'

const COPY: Partial<Record<ClaimStatus, string>> = {
  submitted: 'Thanks, your request was submitted. We’ll let you know.',
  under_review: 'The team is reviewing your request. We’ll let you know.',
  not_selected: 'This item went to another owner. We hope you find yours soon.',
  rejected: 'We couldn’t verify this item as yours. If you think this is a mistake, visit the desk.',
  withdrawn: 'This request was withdrawn.',
}

const group = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

/** Keep the screen on while the QR is shown full screen (browsers can't raise brightness). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [on])
}

function PickupCard({ p }: { p: PickupInfo }) {
  const [full, setFull] = useState(false)
  useWakeLock(full)
  const expired = new Date(p.expires_at).getTime() < Date.now()
  const maps = p.location.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.location.lat},${p.location.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.location.address)}`

  if (p.collected_at)
    return (
      <div className="flex flex-col items-center px-5 py-10 text-center">
        <SuccessMark />
        <p className="mt-4 text-title">Collected</p>
        <p className="mt-1 text-callout font-normal text-ink-2">Your item is back with you. Thanks for using Gumsum.</p>
      </div>
    )

  return (
    <section className="mx-5 rounded-card border border-line p-5" aria-label="Pickup card">
      {expired ? (
        <p className="py-6 text-center text-callout">This code expired. Contact the desk.</p>
      ) : (
        <>
          <button type="button" onClick={() => setFull(true)} className="mx-auto block rounded-input bg-white p-4" aria-label="Show QR code full screen">
            <QRCodeSVG value={p.qr_token} size={208} level="M" />
          </button>
          <div className="mt-4 flex items-center justify-center gap-2">
            <p className="tabular text-display tracking-[0.08em]" aria-label={`Pickup code ${p.code.split('').join(' ')}`}>
              {group(p.code)}
            </p>
            <Tooltip text="Show this at the desk. Bring an ID with the name you signed up with." />
          </div>
          <p className="mt-1 text-center text-caption text-ink-3">Valid until {shortDate(p.expires_at)}</p>
        </>
      )}
      <div className="mt-5 space-y-2 border-t border-line pt-4 text-callout font-normal text-ink-2">
        <p className="flex items-start gap-2"><MapPin size={18} className="mt-px shrink-0" aria-hidden /> {p.location.name}, {p.location.address}</p>
        <p className="flex items-center gap-2"><Clock size={18} className="shrink-0" aria-hidden /> Desk: {p.location.desk_hours}</p>
      </div>
      <a href={maps} target="_blank" rel="noreferrer" className="mt-4 flex h-[52px] items-center justify-center gap-2 rounded-button border border-ink text-callout">
        <Navigation size={18} aria-hidden /> Get directions
      </a>

      <AnimatePresence>
        {full && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white text-[#0a0a0a]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Pickup QR code"
            onClick={() => setFull(false)}
          >
            <QRCodeSVG value={p.qr_token} size={300} level="M" />
            <p className="mt-6 tabular text-[2.5rem] font-semibold tracking-[0.08em]">{group(p.code)}</p>
            <p className="mt-2 text-callout text-[#737373]">{p.item.title}</p>
            <IconButton label="Close" onClick={() => setFull(false)} className="absolute top-[max(1rem,env(safe-area-inset-top))] right-3 !text-[#0a0a0a]">
              <X size={24} />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export default function RequestDetail() {
  const { id = '' } = useParams()
  const claims = useMyClaims()
  useLiveClaims(true, [['claims']])
  const claim = claims.data?.claims.find((c) => c.id === id)
  const showPickup = claim?.status === 'approved' || claim?.status === 'collected'
  const pickup = usePickup(id, !!showPickup)

  return (
    <Page>
      <TopBar back="/requests" title="Request" />
      {claims.isPending ? (
        <div className="px-5"><Skeleton className="h-20" /></div>
      ) : !claim ? (
        <EmptyState title="Request not found." />
      ) : (
        <>
          <Link to={`/items/${claim.item.id}`} className="mx-5 mb-5 flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-input bg-fill">
              {claim.item.thumb_url && <img src={claim.item.thumb_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-title">{claim.item.title}</p>
              <p className="text-caption text-ink-3">{claim.item.location_name} · {shortDate(claim.created_at)}</p>
            </div>
          </Link>
          <div className="mx-5 mb-5"><StatusChip claim={claim.status} /></div>
          {showPickup ? (
            pickup.isPending ? (
              <div className="px-5"><Skeleton className="h-[420px] !rounded-card" /></div>
            ) : pickup.data ? (
              <>
                {claim.status === 'approved' && <p className="mx-5 mb-4 text-body">Good news! Your item is ready for pickup.</p>}
                <PickupCard p={pickup.data} />
              </>
            ) : (
              <p className="px-5 text-callout">Couldn’t load your pickup code. Pull to retry.</p>
            )
          ) : (
            <div className="mx-5 flex gap-3 rounded-card bg-fill p-4">
              <Package size={20} className="mt-0.5 shrink-0" aria-hidden />
              <p className="text-callout font-normal">{COPY[claim.status]}</p>
            </div>
          )}
          {claim.status === 'not_selected' && (
            <div className="mx-5 mt-6"><Link to="/search"><Button variant="secondary">Keep searching</Button></Link></div>
          )}
        </>
      )}
    </Page>
  )
}
