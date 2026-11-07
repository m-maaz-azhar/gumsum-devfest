import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, Bell, ImagePlus, X } from 'lucide-react'
import { api, ApiError } from '../shared/api/client'
import { useInvalidateAll } from '../shared/api/hooks'
import type { ClaimTurn, ItemPublic, SignedUpload } from '../shared/api/types'
import { claimMessageSchema, followupSchema, MSG } from '../shared/schemas'
import { photoError, prepareImage, uploadToSigned } from '../shared/images'
import { enablePush, isIOS, isStandalone, markFirstClaimSubmitted, pushSupported } from '../shared/pwa'
import { vibrate } from '../shared/motion/presets'
import { Button, IconButton } from '../shared/ui/Button'
import { Sheet } from '../shared/ui/Sheet'
import { SuccessMark, TypingDots } from '../shared/ui/Layout'
import { Tooltip } from '../shared/ui/Tooltip'

const FIRST = "Tell us why this is yours. Describe anything only the owner would know, like what's inside, marks or stickers."

interface Msg {
  id: number
  role: 'bot' | 'user'
  content: string
  failed?: boolean
}

export function ClaimSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: ItemPublic }) {
  const nav = useNavigate()
  const invalidate = useInvalidateAll()
  const [messages, setMessages] = useState<Msg[]>([{ id: 0, role: 'bot', content: FIRST }])
  const [draft, setDraft] = useState('')
  const [claimId, setClaimId] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [followupsLeft, setFollowupsLeft] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [proof, setProof] = useState<{ file: File; url: string; uploaded: boolean } | null>(null)
  const [proofError, setProofError] = useState<string | null>(null)
  const [push, setPush] = useState<'idle' | 'asked' | 'granted' | 'denied' | 'ios'>('idle')
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)

  const isFirst = !claimId
  const schema = isFirst ? claimMessageSchema : followupSchema
  const valid = schema.safeParse(draft).success

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking, done])

  async function uploadProof(id: string, p = proof) {
    if (!p || p.uploaded) return
    try {
      const target = await api.post<SignedUpload>(`/claims/${id}/proof-upload-url`)
      await uploadToSigned(target, await prepareImage(p.file))
      setProof({ ...p, uploaded: true })
    } catch {
      setProofError('Couldn’t upload the photo. Your answers were still sent.')
    }
  }

  async function send(text: string) {
    const clean = text.trim()
    if (!schema.safeParse(clean).success || thinking) return
    setError(null)
    setPending(clean)
    setDraft('')
    setMessages((m) => [...m.filter((x) => !x.failed), { id: nextId.current++, role: 'user', content: clean }])
    setThinking(true)
    try {
      const turn = isFirst
        ? await api.post<ClaimTurn>('/claims', { item_id: item.id, message: clean })
        : await api.post<ClaimTurn>(`/claims/${claimId}/messages`, { message: clean })
      setClaimId(turn.claim_id)
      if (proof && !proof.uploaded) await uploadProof(turn.claim_id)
      setPending(null)
      setFollowupsLeft(turn.followups_left)
      if (turn.reply) setMessages((m) => [...m, { id: nextId.current++, role: 'bot', content: turn.reply! }])
      if (turn.done) {
        setDone(true)
        vibrate(20)
        markFirstClaimSubmitted()
        invalidate()
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err && (err.code === 'MODERATION' || err.code === 'VALIDATION' || err.status === 403 || err.status === 429)) {
        setMessages((m) => m.slice(0, -1))
        setDraft(clean)
        setPending(null)
        setError(err.code === 'MODERATION' ? MSG.moderation : err.message)
      } else {
        setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, failed: true } : x)))
        setError('Couldn’t send. Tap to retry.')
      }
    } finally {
      setThinking(false)
    }
  }

  async function askPush() {
    setPush('asked')
    const r = await enablePush().catch(() => 'denied' as const)
    setPush(r === 'granted' ? 'granted' : r === 'ios-install' ? 'ios' : 'denied')
  }

  const canAskPush = !done ? false : isIOS() && !isStandalone() ? true : pushSupported() && typeof Notification !== 'undefined' && Notification.permission === 'default'

  return (
    <Sheet open={open} onClose={onClose} label="Claim this item" height="tall">
      <div className="flex items-center gap-3 border-b border-line px-5 pb-3">
        {item.images[0] && <img src={item.images[0].thumb_url} alt="" className="h-11 w-11 rounded-input object-cover" />}
        <p className="flex-1 truncate text-callout font-semibold">{item.title}</p>
        <IconButton label="Close" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4" aria-live="polite" aria-label="Conversation">
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={m.role === 'bot' ? 'max-w-[85%] self-start' : 'max-w-[85%] self-end'}
              >
                <div
                  className={
                    m.role === 'bot'
                      ? 'rounded-[18px] rounded-bl-md bg-fill px-4 py-2.5 text-body'
                      : `rounded-[18px] rounded-br-md bg-ink px-4 py-2.5 text-body text-on-ink ${m.failed ? 'opacity-60' : ''}`
                  }
                >
                  {m.content}
                </div>
                {m.failed && (
                  <button type="button" className="mt-1 block w-full text-right text-caption text-danger" onClick={() => pending && send(pending)}>
                    Couldn’t send. Tap to retry.
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {thinking && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="self-start rounded-[18px] rounded-bl-md bg-fill px-4 py-2">
              <TypingDots />
            </motion.div>
          )}
          {proof && (
            <div className="relative mt-1 self-end">
              <img src={proof.url} alt="Proof photo" className="h-24 w-24 rounded-input object-cover" />
              {!claimId && (
                <button type="button" aria-label="Remove photo" onClick={() => setProof(null)} className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-on-ink">
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-8 text-center">
            <SuccessMark />
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-4 text-title">
              Request submitted
            </motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-1 text-callout font-normal text-ink-2">
              Thanks, your request was submitted. We’ll let you know.
            </motion.p>
          </motion.div>
        )}
      </div>

      {done ? (
        <div className="border-t border-line px-5 pt-3 pb-4">
          {canAskPush && push === 'idle' && (
            <button type="button" onClick={askPush} className="mb-3 flex w-full items-center gap-3 rounded-card bg-fill p-4 text-left">
              <Bell size={20} aria-hidden />
              <span className="flex-1 text-callout font-normal">
                {isIOS() && !isStandalone() ? 'Add to Home Screen to get notifications.' : 'Get notified when your item is ready.'}
              </span>
              <span className="text-callout">Turn on</span>
            </button>
          )}
          {push === 'ios' && <p className="mb-3 text-center text-caption text-ink-3">Add to Home Screen to get notifications. We’ll also email you.</p>}
          {push === 'granted' && <p className="mb-3 text-center text-caption text-ink-3">Notifications are on.</p>}
          <Button onClick={() => nav('/requests')}>See my requests</Button>
        </div>
      ) : (
        <div className="border-t border-line px-3 pt-2 pb-3">
          {claimId && followupsLeft !== null && !thinking && (
            <div className="mb-2 flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => send('I don’t know')}
                className="h-8 rounded-full border border-line px-3 text-callout"
              >
                I don’t know
              </button>
              <span className="text-caption text-ink-3">
                {followupsLeft === 0 ? 'Last question' : followupsLeft === 1 ? '1 more question' : `Up to ${followupsLeft} more questions`}
              </span>
            </div>
          )}
          {(error || proofError) && (
            <p className="px-2 pb-2 text-caption text-danger" role="alert">
              {error ?? proofError}
            </p>
          )}
          <form
            className="flex items-end gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <span className="flex items-center">
              <IconButton label="Attach a proof photo" onClick={() => fileRef.current?.click()} disabled={!!proof}>
                <ImagePlus size={22} strokeWidth={1.75} />
              </IconButton>
              {!proof && !claimId && <Tooltip text="Optional. A receipt or an old photo of you with the item helps." align="left" />}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const err = photoError(f)
                if (err) return setProofError(err)
                setProofError(null)
                const p = { file: f, url: URL.createObjectURL(f), uploaded: false }
                setProof(p)
                if (claimId) uploadProof(claimId, p)
              }}
            />
            <label className="sr-only" htmlFor="claim-input">Your answer</label>
            <textarea
              id="claim-input"
              data-autofocus
              rows={1}
              value={draft}
              maxLength={isFirst ? 1000 : 500}
              placeholder="Type your answer…"
              onChange={(e) => {
                setDraft(e.target.value)
                setError(null)
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = Math.min(120, e.currentTarget.scrollHeight) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
              className="max-h-[120px] min-h-[44px] flex-1 resize-none rounded-[22px] bg-fill px-4 py-2.5 text-body outline-none focus-visible:outline-none focus:ring-[1.5px] focus:ring-ink"
            />
            <IconButton label="Send" type="submit" disabled={!valid || thinking} className={valid && !thinking ? 'bg-ink !text-on-ink' : 'bg-fill !text-ink-3'}>
              <ArrowUp size={20} strokeWidth={2.25} />
            </IconButton>
          </form>
          {isFirst && draft.length > 0 && !valid && <p className="px-2 pt-1 text-caption text-ink-3">{MSG.claimShort}</p>}
        </div>
      )}
    </Sheet>
  )
}
