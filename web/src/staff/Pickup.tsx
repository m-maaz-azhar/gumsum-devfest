import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Keyboard, ScanLine, X } from 'lucide-react'
import { api, ApiError } from '../shared/api/client'
import { useInvalidateAll } from '../shared/api/hooks'
import type { PickupPreview } from '../shared/api/types'
import { vibrate } from '../shared/motion/presets'
import { Button, IconButton } from '../shared/ui/Button'
import { OtpInput } from '../shared/ui/OtpInput'
import { Sheet } from '../shared/ui/Sheet'
import { SuccessMark } from '../shared/ui/Layout'
import { Tooltip } from '../shared/ui/Tooltip'

/** STF-CLM-04: full-screen rear-camera QR scanner, with a 6-digit code fallback. */
export default function Pickup() {
  const nav = useNavigate()
  const invalidate = useInvalidateAll()
  const [mode, setMode] = useState<'scan' | 'code'>('scan')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<PickupPreview | null>(null)
  const [handed, setHanded] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scanning = useRef(true)

  async function verify(body: { code?: string; qr_token?: string }) {
    setBusy(true)
    setError(null)
    try {
      const p = await api.post<PickupPreview>('/staff/pickups/verify', body)
      vibrate(30)
      setPreview(p)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That code doesn’t match any pickup.')
      setShake((s) => s + 1)
      setCode('')
      scanning.current = true
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (mode !== 'scan' || preview) return
    let stop: (() => void) | undefined
    let cancelled = false
    scanning.current = true
    ;(async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current!, (res) => {
          if (res && scanning.current) {
            scanning.current = false
            void verify({ qr_token: res.getText() })
          }
        })
        if (cancelled) controls.stop()
        stop = () => controls.stop()
      } catch {
        setCamError('Camera unavailable. Enter the code instead.')
      }
    })()
    return () => {
      cancelled = true
      stop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, preview])

  const reset = () => {
    setPreview(null)
    setHanded(false)
    setCode('')
    setError(null)
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <div className="absolute top-0 right-0 left-0 z-10 flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <IconButton label="Close scanner" onClick={() => nav('/staff')} className="!text-white">
          <X size={24} />
        </IconButton>
        <span className="flex items-center gap-1 text-callout">
          Pickup <Tooltip text="Ask the owner to show the code in their Requests tab." align="right" />
        </span>
      </div>

      {mode === 'scan' ? (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline aria-label="Camera" />
          <div className="relative h-64 w-64 rounded-[28px] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" aria-hidden>
            <div className="absolute inset-0 rounded-[28px] border-[3px] border-white" />
          </div>
          <p className="absolute bottom-40 px-8 text-center text-callout" role="status">
            {camError ?? error ?? 'Point the camera at the owner’s QR code.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center bg-paper px-5 text-ink">
          <h1 className="text-display">Enter pickup code</h1>
          <p className="mt-2 mb-8 text-body text-ink-2">6 digits from the owner’s Requests tab.</p>
          <OtpInput label="Pickup code" length={6} value={code} onChange={(v) => (setCode(v), setError(null))} onComplete={(v) => verify({ code: v })} error={!!error} shakeKey={shake} disabled={busy} autoFocus />
          <p className="mt-3 min-h-[18px] text-caption text-danger" role="alert">{error}</p>
        </div>
      )}

      <div className={`px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${mode === 'code' ? 'bg-paper' : ''}`}>
        <Button variant={mode === 'scan' ? 'secondary' : 'ghost'} onClick={() => (setMode(mode === 'scan' ? 'code' : 'scan'), setError(null))}>
          {mode === 'scan' ? <><Keyboard size={18} /> Enter code instead</> : <><ScanLine size={18} /> Scan QR instead</>}
        </Button>
      </div>

      <Sheet open={!!preview} onClose={reset} label="Confirm pickup">
        {preview && (
          <div className="px-5 pt-2 pb-5 text-ink">
            {handed ? (
              <div className="flex flex-col items-center py-6 text-center">
                <SuccessMark />
                <p className="mt-4 text-title">Returned</p>
                <p className="mt-1 text-callout font-normal text-ink-2">{preview.item.title} is back with {preview.claimant.name.split(' ')[0]}.</p>
                <Button className="mt-6" onClick={reset}>Next pickup</Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  {preview.item.cover_url && <img src={preview.item.cover_url} alt="" className="h-20 w-20 rounded-input object-cover" />}
                  <div className="min-w-0">
                    <p className="text-title">{preview.item.title}</p>
                    <p className="text-body">{preview.claimant.name}</p>
                    {preview.claimant.phone_last4 && <p className="text-caption text-ink-3">Phone ends in {preview.claimant.phone_last4}</p>}
                  </div>
                </div>
                <p className="mt-4 rounded-input bg-fill px-4 py-3 text-callout font-normal">Check their ID matches the name before handing over.</p>
                {error && <p className="mt-2 text-caption text-danger">{error}</p>}
                <Button
                  className="mt-4"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await api.post(`/staff/pickups/${preview.claim_id}/handover`)
                      setHanded(true)
                      vibrate(20)
                      invalidate()
                    } catch (e) {
                      setError(e instanceof ApiError ? e.message : 'Couldn’t complete. Try again.')
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Hand over
                </Button>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
