import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Camera, ChevronLeft, ChevronRight, Lock, RotateCw, Sparkles, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { api, ApiError } from '../shared/api/client'
import { useInvalidateAll } from '../shared/api/hooks'
import type { SignedUpload, Suggestion } from '../shared/api/types'
import { photoError, prepareImage, uploadToSigned } from '../shared/images'
import { firstError, foundAtSchema, looksLikeFewDetails, MSG, privateSchema, spotSchema, tagSchema, titleSchema } from '../shared/schemas'
import { Button, IconButton, TextButton } from '../shared/ui/Button'
import { BigInput, Input, Textarea } from '../shared/ui/Field'
import { StepShell, StepTitle } from '../shared/ui/StepForm'
import { Chip } from '../shared/ui/Chip'
import { Tooltip } from '../shared/ui/Tooltip'
import { SuccessMark } from '../shared/ui/Layout'
import { ConfirmSheet } from '../claimant/Profile'

interface Photo {
  key: string
  file: File
  preview: string
  state: 'uploading' | 'done' | 'error'
  path?: string
}

const STEPS = ['photos', 'title', 'location', 'private', 'review'] as const
type Step = (typeof STEPS)[number]
const LAST_LOC = 'gumsum:last-location'
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

export default function AddItem() {
  const nav = useNavigate()
  const { me } = useAuth()
  const invalidate = useInvalidateAll()
  const locations = me?.role === 'staff' ? me.locations : []
  const [step, setStep] = useState<Step>('photos')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photoMsg, setPhotoMsg] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [colours, setColours] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle')
  const [locationId, setLocationId] = useState(() => {
    const last = localStorage.getItem(LAST_LOC)
    return locations.find((l) => l.id === last)?.id ?? locations[0]?.id ?? ''
  })
  const [spot, setSpot] = useState('')
  const [foundAt, setFoundAt] = useState(() => toLocalInput(new Date()))
  const [secret, setSecret] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [shake, setShake] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const suggested = useRef(false)

  const done = photos.filter((p) => p.state === 'done')
  const errors: Record<Step, string | null> = {
    photos: done.length < 2 || photos.some((p) => p.state === 'uploading') ? MSG.photosMin : null,
    title: firstError(titleSchema, title) ?? (tags.length > 8 ? MSG.tags : null),
    location: !locationId ? MSG.location : firstError(spotSchema, spot) ?? firstError(foundAtSchema, foundAt ? new Date(foundAt).toISOString() : ''),
    private: firstError(privateSchema, secret),
    review: null,
  }
  const idx = STEPS.indexOf(step)
  const dirty = photos.length > 0 || !!title || !!secret

  // ---- photos
  async function upload(list: Photo[]) {
    try {
      const { uploads } = await api.post<{ uploads: SignedUpload[] }>('/staff/uploads', { files: list.map((p) => ({ name: p.file.name, type: p.file.type })) })
      await Promise.all(
        list.map(async (p, i) => {
          try {
            await uploadToSigned(uploads[i], await prepareImage(p.file))
            setPhotos((all) => all.map((x) => (x.key === p.key ? { ...x, state: 'done', path: uploads[i].path } : x)))
          } catch {
            setPhotos((all) => all.map((x) => (x.key === p.key ? { ...x, state: 'error' } : x)))
          }
        }),
      )
    } catch {
      setPhotos((all) => all.map((x) => (list.some((p) => p.key === x.key) ? { ...x, state: 'error' } : x)))
    }
  }

  function addFiles(files: FileList | File[]) {
    const room = 6 - photos.length
    const arr = [...files]
    const bad = arr.map(photoError).find(Boolean)
    const ok = arr.filter((f) => !photoError(f)).slice(0, room)
    setPhotoMsg(bad ?? (arr.length > room ? 'You can add up to 6 photos.' : null))
    if (!ok.length) return
    const next = ok.map((f) => ({ key: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f), state: 'uploading' as const }))
    setPhotos((p) => [...p, ...next])
    void upload(next)
  }

  // AI suggestion after the 2nd photo finishes uploading (STF-ITEM-03). 8s timeout, silent fallback.
  useEffect(() => {
    if (suggested.current || done.length < 2) return
    suggested.current = true
    setAiState('loading')
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000))
    Promise.race([api.post<Suggestion>('/staff/items/suggest', { image_paths: done.map((p) => p.path) }), timeout])
      .then((s) => {
        if (!s || !s.title) return setAiState('failed')
        setTitle((t) => t || s.title)
        setCategory((c) => c || s.category)
        setColours((c) => (c.length ? c : s.colours))
        setAiState('done')
      })
      .catch(() => setAiState('failed'))
  }, [done])

  const move = (i: number, d: -1 | 1) =>
    setPhotos((p) => {
      const n = [...p]
      ;[n[i], n[i + d]] = [n[i + d], n[i]]
      return n
    })

  // ---- navigation
  const next = () => {
    setTouched((t) => ({ ...t, [step]: true }))
    if (errors[step]) return setShake((s) => s + 1)
    if (step === 'location') localStorage.setItem(LAST_LOC, locationId)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }
  const back = () => (idx > 0 ? setStep(STEPS[idx - 1]) : close())
  const close = () => (dirty && !publishedId ? setConfirmClose(true) : nav('/staff'))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmClose) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function publish() {
    setPublishing(true)
    setPublishError(null)
    try {
      const res = await api.post<{ id: string }>('/staff/items', {
        title: title.trim(),
        category: category || null,
        colours,
        tags,
        location_id: locationId,
        exact_spot: spot.trim() || null,
        found_at: foundAt ? new Date(foundAt).toISOString() : null,
        private_description: secret.trim(),
        image_paths: done.map((p) => p.path),
      })
      setPublishedId(res.id)
      invalidate()
    } catch (e) {
      setPublishError(e instanceof ApiError && e.fields ? Object.values(e.fields)[0] : 'Couldn’t publish. Check your connection and try again.')
    } finally {
      setPublishing(false)
    }
  }

  const reset = () => {
    setPhotos([]); setTitle(''); setCategory(''); setColours([]); setTags([]); setSpot(''); setSecret('')
    setFoundAt(toLocalInput(new Date())); setTouched({}); setPublishedId(null); setAiState('idle'); suggested.current = false
    setStep('photos')
    setTimeout(() => camRef.current?.click(), 50)
  }

  if (publishedId)
    return (
      <div className="flex min-h-[100dvh] flex-col px-5 pt-safe">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <SuccessMark />
          <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-5 text-display">Item published</motion.h1>
          <p className="mt-2 text-body text-ink-2">It’s now searchable by owners.</p>
        </div>
        <div className="flex flex-col gap-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button onClick={reset}>Add another</Button>
          <Button variant="secondary" onClick={() => nav(`/staff/items/${publishedId}`, { replace: true })}>View item</Button>
        </div>
      </div>
    )

  const err = touched[step] ? errors[step] : null
  const loc = locations.find((l) => l.id === locationId)

  return (
    <>
      <StepShell
        stepKey={step}
        step={idx + 1}
        total={STEPS.length}
        onBack={back}
        onClose={close}
        footer={
          step === 'review' ? (
            <>
              {publishError && <p className="mb-2 text-center text-caption text-danger" role="alert">{publishError}</p>}
              <Button loading={publishing} onClick={publish}>Publish</Button>
            </>
          ) : (
            <>
              <Button disabled={!!errors[step]} onClick={next}>Next</Button>
              {errors[step] && step === 'photos' && <p className="mt-2 text-center text-caption text-ink-3">{photos.some((p) => p.state === 'uploading') ? 'Uploading…' : MSG.photosMin}</p>}
            </>
          )
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (step !== 'review') next()
          }}
        >
          {step === 'photos' && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                addFiles(e.dataTransfer.files)
              }}
            >
              <div className="flex items-start gap-2">
                <StepTitle>Add photos</StepTitle>
                <Tooltip className="mt-3" text="Take 2 clear photos from different angles. Don’t show the details you will write as the private description, like what’s inside or a name tag." />
              </div>
              <button
                type="button"
                onClick={() => camRef.current?.click()}
                disabled={photos.length >= 6}
                className="flex h-44 w-full flex-col items-center justify-center gap-3 rounded-card border-[1.5px] border-dashed border-ink-3 bg-fill text-callout disabled:opacity-50"
              >
                <Camera size={32} strokeWidth={1.5} aria-hidden />
                Take photo
              </button>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ''))} />
              <input ref={galRef} type="file" accept="image/*,.heic,.heif" multiple hidden data-testid="gallery-input" onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ''))} />
              <div className="mt-3 flex items-center justify-between">
                <TextButton onClick={() => galRef.current?.click()} disabled={photos.length >= 6}>Choose from gallery</TextButton>
                <span className="text-caption text-ink-3 tabular">{photos.length} of 6 photos</span>
              </div>
              {photoMsg && <p className="mt-1 text-caption text-danger" role="alert">{photoMsg}</p>}
              {err && !photoMsg && <p className="mt-1 text-caption text-danger">{err}</p>}
              <ul className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2" aria-label="Photos">
                {photos.map((p, i) => (
                  <motion.li key={p.key} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative h-28 w-28 shrink-0">
                    <img src={p.preview} alt={`Photo ${i + 1}`} className={`h-full w-full rounded-input object-cover ${p.state !== 'done' ? 'opacity-50' : ''}`} />
                    {i === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-paper px-2 text-caption">Cover</span>}
                    {p.state === 'uploading' && <span className="absolute inset-x-2 top-1/2 h-1 overflow-hidden rounded-full bg-white/60"><span className="block h-full w-1/2 animate-pulse bg-ink" /></span>}
                    {p.state === 'error' && (
                      <IconButton label="Retry upload" className="absolute inset-0 m-auto bg-paper" onClick={() => (setPhotos((all) => all.map((x) => (x.key === p.key ? { ...x, state: 'uploading' } : x))), upload([p]))}>
                        <RotateCw size={18} />
                      </IconButton>
                    )}
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((all) => all.filter((x) => x.key !== p.key))} className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-on-ink">
                      <X size={14} />
                    </button>
                    <div className="absolute right-1 bottom-1 flex gap-1">
                      {i > 0 && <button type="button" aria-label="Move left" onClick={() => move(i, -1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-paper"><ChevronLeft size={14} /></button>}
                      {i < photos.length - 1 && <button type="button" aria-label="Move right" onClick={() => move(i, 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-paper"><ChevronRight size={14} /></button>}
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}

          {step === 'title' && (
            <>
              <StepTitle>What is it?</StepTitle>
              <BigInput
                label="Title"
                autoFocus
                placeholder="Black backpack"
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title && setTouched((t) => ({ ...t, title: true }))}
                error={err}
                shakeKey={shake}
                helper={aiState === 'done' ? <span className="inline-flex items-center gap-1"><Sparkles size={13} aria-hidden /> Suggested by AI. Edit if needed.</span> : aiState === 'loading' ? 'Looking at your photos…' : 'Keep it generic. No names, contents or serial numbers.'}
              />
              <div className="mt-4">
                <p className="mb-2 text-caption text-ink-2">Public tags (used for search)</p>
                <div className="flex flex-wrap gap-2">
                  {category && <Chip onRemove={() => setCategory('')} removeLabel="Remove category">{category}</Chip>}
                  {colours.map((c) => <Chip key={c} onRemove={() => setColours((x) => x.filter((y) => y !== c))} removeLabel={`Remove ${c}`}>{c}</Chip>)}
                  {tags.map((t) => <Chip key={t} onRemove={() => setTags((x) => x.filter((y) => y !== t))} removeLabel={`Remove ${t}`}>{t}</Chip>)}
                </div>
                <Input
                  className="mt-3"
                  label="Add a tag"
                  placeholder="e.g. black, bag"
                  value={tagDraft}
                  maxLength={24}
                  onChange={(e) => setTagDraft(e.target.value)}
                  error={tagDraft && firstError(tagSchema, tagDraft) ? MSG.tags : tags.length + colours.length + (category ? 1 : 0) > 8 ? MSG.tags : null}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      const t = tagDraft.trim().toLowerCase()
                      if (!firstError(tagSchema, t) && tags.length < 8 && !tags.includes(t)) {
                        setTags((x) => [...x, t])
                        setTagDraft('')
                      }
                    }
                  }}
                  helper="Press Enter to add. Up to 8."
                />
              </div>
            </>
          )}

          {step === 'location' && (
            <>
              <StepTitle>Where was it found?</StepTitle>
              <label className="mb-2 block text-caption text-ink-2" htmlFor="loc">Place</label>
              <select id="loc" value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-[52px] w-full rounded-input bg-fill px-4 text-body outline-none focus:ring-[1.5px] focus:ring-ink">
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <Input
                className="mt-5"
                label={<>Exact spot (optional) <Tooltip text="Shown to the public. Keep it general." /></>}
                placeholder="Food court, near gate 3"
                maxLength={80}
                value={spot}
                onChange={(e) => setSpot(e.target.value)}
                error={firstError(spotSchema, spot)}
              />
              <Input
                label="Date and time found"
                type="datetime-local"
                value={foundAt}
                max={toLocalInput(new Date())}
                onChange={(e) => setFoundAt(e.target.value)}
                error={foundAt && firstError(foundAtSchema, new Date(foundAt).toISOString())}
              />
            </>
          )}

          {step === 'private' && (
            <>
              <div className="flex items-start gap-2">
                <StepTitle>What would only the owner know?</StepTitle>
                <Tooltip className="mt-3" align="right" text="List 3 or more specific details: contents, stickers, marks, lock-screen image, name tags. The more specific, the better the AI can spot the real owner." />
              </div>
              <p className="mb-4 flex items-center gap-2 rounded-input bg-fill px-3 py-2 text-callout font-normal">
                <Lock size={16} aria-hidden /> Only your team and the AI can see this.
              </p>
              <Textarea
                label="Private description"
                autoFocus
                max={1000}
                value={secret}
                placeholder="e.g. Blue Nike water bottle inside, keychain shaped like a cat, small scratch near the zip."
                onChange={(e) => setSecret(e.target.value)}
                onBlur={() => secret && setTouched((t) => ({ ...t, private: true }))}
                error={err}
                shakeKey={shake}
                helper={looksLikeFewDetails(secret) ? MSG.privateTip : 'Separate details with commas.'}
              />
            </>
          )}

          {step === 'review' && (
            <>
              <StepTitle>Check and publish</StepTitle>
              <dl className="divide-y divide-line rounded-card bg-fill">
                {[
                  { k: 'photos' as Step, label: 'Photos', v: <div className="mt-2 flex gap-2">{done.map((p) => <img key={p.key} src={p.preview} alt="" className="h-14 w-14 rounded-input object-cover" />)}</div> },
                  { k: 'title' as Step, label: 'Title', v: <>{title}<span className="block text-caption text-ink-3">{[category, ...colours, ...tags].filter(Boolean).join(', ')}</span></> },
                  { k: 'location' as Step, label: 'Found at', v: <>{loc?.name}{spot && ` · ${spot}`}<span className="block text-caption text-ink-3">{new Date(foundAt).toLocaleString()}</span></> },
                  { k: 'private' as Step, label: 'Private description', v: <span className="flex gap-1.5"><Lock size={14} className="mt-1 shrink-0" aria-hidden />{secret}</span> },
                ].map((r) => (
                  <div key={r.k} className="p-4">
                    <div className="flex items-center justify-between">
                      <dt className="text-caption text-ink-3">{r.label}</dt>
                      <TextButton className="!min-h-0" onClick={() => setStep(r.k)} aria-label={`Edit ${r.label}`}>Edit</TextButton>
                    </div>
                    <dd className="mt-1 text-body">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <button type="submit" hidden />
        </form>
      </StepShell>
      <ConfirmSheet open={confirmClose} onClose={() => setConfirmClose(false)} title="Discard this item?" body="Photos and details you added will be lost." confirm="Discard" danger onConfirm={() => nav('/staff')} />
    </>
  )
}
