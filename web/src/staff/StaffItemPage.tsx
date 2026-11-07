import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { AlertTriangle, Check, Eye, EyeOff, Lock, Minus, MoreHorizontal, X } from 'lucide-react'
import { useStaffClaims, useStaffItem, useInvalidateAll } from '../shared/api/hooks'
import { api, ApiError } from '../shared/api/client'
import type { ArchiveReason, RejectReason, StaffClaim, StaffItem, Verdict } from '../shared/api/types'
import { firstError, MSG, privateSchema, spotSchema, titleSchema } from '../shared/schemas'
import { Page } from '../shared/ui/Page'
import { EmptyState, Skeleton, TopBar } from '../shared/ui/Layout'
import { StatusChip } from '../shared/ui/Chip'
import { Button, IconButton } from '../shared/ui/Button'
import { Input, Textarea } from '../shared/ui/Field'
import { Sheet } from '../shared/ui/Sheet'
import { Tooltip } from '../shared/ui/Tooltip'
import { useToast } from '../shared/ui/Toast'
import { dateTime, foundAgo } from '../shared/time'
import { Carousel } from '../claimant/ItemPage'
import { ConfirmSheet } from '../claimant/Profile'

const VERDICT: Record<Verdict, { icon: typeof Check; word: string }> = {
  match: { icon: Check, word: 'Matched' },
  partial: { icon: Minus, word: 'Partly matched' },
  none: { icon: X, word: 'Missed' },
  contradiction: { icon: AlertTriangle, word: 'Contradiction' },
}

const EVENT_LABEL: Record<string, string> = {
  item_created: 'Item logged',
  item_edited: 'Item edited',
  item_archived: 'Archived',
  claim_submitted: 'Claim submitted',
  claim_approved: 'Claim approved',
  claim_rejected: 'Claim rejected',
  handed_over: 'Handed over',
}

function ScoreBar({ c }: { c: StaffClaim }) {
  if (c.score_state === 'pending') return <span className="text-caption text-ink-3 animate-pulse">Scoring…</span>
  if (c.score_state === 'failed' || c.score == null) return <span className="text-caption text-ink-3">Score unavailable</span>
  return (
    <div className="flex items-center gap-2" aria-label={`Confidence ${c.score} of 100, ${c.score_label}`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full bg-ink" initial={{ width: 0 }} animate={{ width: `${c.score}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
      </div>
      <span className="text-caption tabular font-medium">{c.score}</span>
      <span className="text-caption text-ink-3">{c.score_label}</span>
    </div>
  )
}

function ClaimReview({ c, item, onClose }: { c: StaffClaim; item: StaffItem; onClose: () => void }) {
  const toast = useToast()
  const invalidate = useInvalidateAll()
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState<RejectReason | ''>('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const open = c.status === 'submitted' || c.status === 'under_review'
  const first = c.claimant.name.split(' ')[0]

  async function act(kind: 'approve' | 'reject' | 'rescore') {
    setBusy(true)
    setErr(null)
    try {
      if (kind === 'reject') {
        if (!reason) throw new ApiError(422, { code: 'VALIDATION', message: MSG.reason })
        await api.post(`/staff/claims/${c.id}/reject`, { reason, note: reason === 'Other' ? note.trim() : undefined })
        toast(`Rejected. ${first} has been notified.`)
      } else if (kind === 'approve') {
        await api.post(`/staff/claims/${c.id}/approve`)
        toast(`Approved. ${first} has been notified.`)
      } else {
        await api.post(`/staff/claims/${c.id}/rescore`)
      }
      await invalidate()
      setConfirm(null)
      if (kind !== 'rescore') onClose()
    } catch (e) {
      setErr(e instanceof ApiError ? Object.values(e.fields ?? {})[0] ?? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-5 pb-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-callout font-semibold">{c.claimant.name}</p>
          <p className="text-caption text-ink-3">{c.submitted_at && `Submitted ${foundAgo(c.submitted_at)}`}{c.claimant.phone_last4 && ` · phone ends ${c.claimant.phone_last4}`}</p>
        </div>
        <StatusChip claim={c.status} small />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-2">
          <ScoreBar c={c} />
          <Tooltip text="AI estimate of how well the answers match the private description and photos. You make the final decision." />
        </div>
        {c.score_state === 'failed' && <Button variant="secondary" className="mt-3" loading={busy} onClick={() => act('rescore')}>Retry scoring</Button>}
        {c.rationale && (
          <section className="mt-4" aria-label="AI rationale">
            <p className="text-callout font-normal text-ink-2">{c.rationale.summary}</p>
            <ul className="mt-3 space-y-2">
              {c.rationale.details.map((d) => {
                const V = VERDICT[d.verdict]
                return (
                  <li key={d.idx} className={`flex gap-3 rounded-input p-3 ${d.verdict === 'contradiction' ? 'border border-ink' : 'bg-fill'}`}>
                    <V.icon size={18} className="mt-0.5 shrink-0" strokeWidth={2.25} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-callout"><span className="font-semibold">{V.word}:</span> {c.details[d.idx] ?? `Detail ${d.idx + 1}`}</p>
                      <p className="text-caption text-ink-3">{d.evidence}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-caption text-ink-3">Photos: {c.rationale.photo_consistency}</p>
          </section>
        )}
        {c.proof_url && (
          <section className="mt-5">
            <h3 className="text-caption text-ink-3">Proof photo</h3>
            <img src={c.proof_url} alt="Claimant's proof" className="mt-2 max-h-60 rounded-input" />
          </section>
        )}
        <section className="mt-5" aria-label="Chat transcript">
          <h3 className="text-caption text-ink-3">Transcript</h3>
          <div className="mt-2 flex flex-col gap-2">
            {c.messages.map((m, i) => (
              <div key={i} className={m.role === 'bot' ? 'max-w-[85%] self-start rounded-[18px] rounded-bl-md bg-fill px-3 py-2 text-callout font-normal' : 'max-w-[85%] self-end rounded-[18px] rounded-br-md bg-ink px-3 py-2 text-callout font-normal text-on-ink'}>
                {m.content}
              </div>
            ))}
          </div>
        </section>
      </div>
      {open && (
        <div className="flex gap-2 border-t border-line px-5 pt-3 pb-4">
          <Button variant="secondary" onClick={() => setConfirm('reject')}>Reject</Button>
          <Button onClick={() => setConfirm('approve')}>Approve</Button>
        </div>
      )}
      <ConfirmSheet
        open={confirm === 'approve'}
        onClose={() => (setConfirm(null), setErr(null))}
        title={`Approve ${first}’s claim?`}
        body={err ?? `Other claims on ${item.title.toLowerCase()} will be closed.`}
        confirm="Approve"
        loading={busy}
        onConfirm={() => act('approve')}
      />
      <Sheet open={confirm === 'reject'} onClose={() => setConfirm(null)} label="Reject claim">
        <div className="px-5 pt-2 pb-5">
          <h2 className="text-title">Reject {first}’s claim?</h2>
          <p className="mt-1 text-callout font-normal text-ink-2">They’ll get a kind, generic message. The reason stays internal.</p>
          <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Reason">
            {(['Details don’t match', 'Item already returned', 'Suspected false claim', 'Other'] as RejectReason[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => (setReason(r), setErr(null))} className={`flex min-h-[48px] items-center justify-between rounded-input px-4 text-left text-body ${reason === r ? 'bg-ink text-on-ink' : 'bg-fill'}`}>
                {r}
                {reason === r && <Check size={18} />}
              </button>
            ))}
          </div>
          {reason === 'Other' && <Textarea className="mt-3" label="Reason" max={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add 5 to 200 characters." />}
          {err && <p className="mt-2 text-caption text-danger" role="alert">{err}</p>}
          <Button className="mt-4" loading={busy} disabled={!reason || (reason === 'Other' && (note.trim().length < 5 || note.trim().length > 200))} onClick={() => act('reject')}>Reject claim</Button>
        </div>
      </Sheet>
    </>
  )
}

function EditSheet({ item, open, onClose }: { item: StaffItem; open: boolean; onClose: () => void }) {
  const invalidate = useInvalidateAll()
  const toast = useToast()
  const [title, setTitle] = useState(item.title)
  const [spot, setSpot] = useState(item.exact_spot ?? '')
  const [secret, setSecret] = useState(item.private_description)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const errors = { title: firstError(titleSchema, title), spot: firstError(spotSchema, spot), secret: firstError(privateSchema, secret) }
  return (
    <Sheet open={open} onClose={onClose} label="Edit item" height="tall">
      <form
        className="flex-1 overflow-y-auto px-5 pt-2 pb-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (Object.values(errors).some(Boolean)) return
          setBusy(true)
          try {
            await api.patch(`/staff/items/${item.id}`, { title: title.trim(), exact_spot: spot.trim() || null, private_description: secret.trim() })
            await invalidate()
            toast('Saved.')
            onClose()
          } catch (e2) {
            setErr(e2 instanceof ApiError ? Object.values(e2.fields ?? {})[0] ?? e2.message : 'Couldn’t save. Try again.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <h2 className="mb-4 text-title">Edit item</h2>
        <Input label="Title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <Input label="Exact spot" value={spot} maxLength={80} onChange={(e) => setSpot(e.target.value)} error={errors.spot} />
        <Textarea label={<><Lock size={13} aria-hidden /> Private description</>} value={secret} max={1000} onChange={(e) => setSecret(e.target.value)} error={errors.secret} />
        {err && <p className="mb-2 text-caption text-danger">{err}</p>}
        <Button type="submit" loading={busy}>Save</Button>
      </form>
    </Sheet>
  )
}

export default function StaffItemPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const invalidate = useInvalidateAll()
  const item = useStaffItem(id)
  const claims = useStaffClaims(id)
  const [tab, setTab] = useState<'claims' | 'details' | 'activity'>('claims')
  const [openClaim, setOpenClaim] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [menu, setMenu] = useState(false)
  const [edit, setEdit] = useState(false)
  const [archive, setArchive] = useState(false)
  const [archiveReason, setArchiveReason] = useState<ArchiveReason | ''>('')
  const [archiveErr, setArchiveErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (item.isError) return <Page><TopBar back="/staff/items" /><EmptyState title="Item not found." /></Page>
  const d = item.data
  const list = claims.data?.claims ?? []
  const current = list.find((c) => c.id === openClaim)

  return (
    <Page withNav>
      <TopBar
        back="/staff/items"
        title={d?.title}
        heading={false}
        right={d && d.status !== 'archived' && d.status !== 'returned' && <IconButton label="Item actions" onClick={() => setMenu(true)}><MoreHorizontal size={22} /></IconButton>}
      />
      <div className="px-5">
        {d ? <Carousel itemId={d.id} images={d.images} title={d.title} /> : <Skeleton className="aspect-square !rounded-card" />}
        {d && (
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-title">{d.title}</h1>
              <p className="text-caption text-ink-3">{d.location.name}{d.exact_spot && ` · ${d.exact_spot}`} · found {foundAgo(d.found_at)}</p>
            </div>
            <StatusChip item={d.status} />
          </div>
        )}
        <div className="mt-5 grid grid-cols-3 rounded-input bg-fill p-1" role="tablist" aria-label="Item sections">
          {(['claims', 'details', 'activity'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`relative h-9 rounded-[8px] text-callout capitalize ${tab === t ? 'text-ink' : 'text-ink-3'}`}>
              {tab === t && <motion.span layoutId="seg" className="absolute inset-0 rounded-[8px] bg-paper shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
              <span className="relative">{t === 'claims' ? `Claims${list.length ? ` (${list.length})` : ''}` : t}</span>
            </button>
          ))}
        </div>

        <div className="mt-4" role="tabpanel">
          {tab === 'claims' &&
            (claims.isPending ? (
              <Skeleton className="h-16" />
            ) : list.length === 0 ? (
              <EmptyState title="No claims yet." body="Claims appear here, ranked by AI confidence." />
            ) : (
              <ul>
                {list.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOpenClaim(c.id)} className="flex w-full items-center gap-3 border-b border-line py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-callout font-semibold">
                          {c.claimant.name}
                          {c.rationale?.details.some((x) => x.verdict === 'contradiction') && <AlertTriangle size={14} aria-label="Contradiction" />}
                        </p>
                        <div className="mt-1"><ScoreBar c={c} /></div>
                        <p className="mt-0.5 text-caption text-ink-3">{c.submitted_at && foundAgo(c.submitted_at)}</p>
                      </div>
                      <StatusChip claim={c.status} small />
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          {tab === 'details' && d && (
            <dl className="space-y-4 text-body">
              <div><dt className="text-caption text-ink-3">Category and colours</dt><dd>{[d.category, ...d.colours, ...d.tags].filter(Boolean).join(', ') || '—'}</dd></div>
              <div><dt className="text-caption text-ink-3">Found</dt><dd>{dateTime(d.found_at)} at {d.location.name}</dd></div>
              <div>
                <dt className="flex items-center gap-1 text-caption text-ink-3"><Lock size={13} aria-hidden /> Private description</dt>
                <dd className="mt-1 flex items-start gap-2">
                  <span className={showSecret ? '' : 'select-none blur-sm'} aria-hidden={!showSecret}>{showSecret ? d.private_description : 'Hidden until you tap Show'}</span>
                  <button type="button" onClick={() => setShowSecret((s) => !s)} className="ml-auto flex shrink-0 items-center gap-1 text-callout">
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />} {showSecret ? 'Hide' : 'Show'}
                  </button>
                </dd>
              </div>
              {d.archive_reason && <div><dt className="text-caption text-ink-3">Archive reason</dt><dd>{d.archive_reason}</dd></div>}
            </dl>
          )}
          {tab === 'activity' && d && (
            <ol className="border-l border-line pl-4">
              {d.timeline.map((e, i) => (
                <li key={i} className="relative pb-4">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-ink" aria-hidden />
                  <p className="text-callout">{EVENT_LABEL[e.type] ?? e.type}{e.note && ` · ${e.note}`}</p>
                  <p className="text-caption text-ink-3">{dateTime(e.at)}{e.actor && ` · ${e.actor}`}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <Sheet open={!!current} onClose={() => setOpenClaim(null)} label="Claim review" height="tall">
        {current && d && <ClaimReview c={current} item={d} onClose={() => setOpenClaim(null)} />}
      </Sheet>
      <Sheet open={menu} onClose={() => setMenu(false)} label="Item actions">
        <div className="flex flex-col gap-2 px-5 pt-2 pb-5">
          <Button variant="secondary" onClick={() => (setMenu(false), setEdit(true))}>Edit item</Button>
          <Button variant="danger" onClick={() => (setMenu(false), setArchiveErr(null), setArchive(true))}>Archive item</Button>
        </div>
      </Sheet>
      {d && edit && <EditSheet item={d} open={edit} onClose={() => setEdit(false)} />}
      <Sheet open={archive} onClose={() => setArchive(false)} label="Archive item">
        <div className="px-5 pt-2 pb-5">
          <h2 className="text-title">Archive this item?</h2>
          <p className="mt-1 text-callout font-normal text-ink-2">It will no longer appear in search.</p>
          <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Reason">
            {(['Donated', 'Disposed', 'Given to police', 'Other'] as ArchiveReason[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={archiveReason === r} onClick={() => setArchiveReason(r)} className={`min-h-[48px] rounded-input px-3 text-body ${archiveReason === r ? 'bg-ink text-on-ink' : 'bg-fill'}`}>{r}</button>
            ))}
          </div>
          {archiveErr && <p className="mt-3 text-caption text-danger" role="alert">{archiveErr}</p>}
          <Button
            className="mt-4"
            disabled={!archiveReason}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.post(`/staff/items/${id}/archive`, { reason: archiveReason })
                await invalidate()
                setArchive(false)
                toast('Item archived.')
              } catch (e) {
                setArchiveErr(e instanceof ApiError ? e.message : 'Couldn’t archive. Try again.')
              } finally {
                setBusy(false)
              }
            }}
          >
            Archive
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}
