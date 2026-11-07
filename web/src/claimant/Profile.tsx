import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import { useAuth } from '../auth/AuthProvider'
import { useUpdateMe } from '../shared/api/hooks'
import { api, ApiError } from '../shared/api/client'
import { firstError, nameSchema, phoneSchema } from '../shared/schemas'
import { disablePush, enablePush } from '../shared/pwa'
import { getLocationPref, requestLocation, setLocationPref } from '../shared/location'
import { Page } from '../shared/ui/Page'
import { Sheet } from '../shared/ui/Sheet'
import { Button } from '../shared/ui/Button'
import { Input } from '../shared/ui/Field'
import { useToast } from '../shared/ui/Toast'

export function Group({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <section className="mx-5 mt-6">
      {title && <h2 className="mb-2 px-1 text-caption text-ink-3 uppercase tracking-wide">{title}</h2>}
      <ul className="overflow-hidden rounded-card bg-fill">{children}</ul>
    </section>
  )
}

export function Row({ label, value, onClick, danger, children }: { label: string; value?: React.ReactNode; onClick?: () => void; danger?: boolean; children?: React.ReactNode }) {
  const inner = (
    <>
      <span className={danger ? 'text-danger' : undefined}>{label}</span>
      <span className="ml-auto flex min-w-0 items-center gap-1 truncate text-ink-3">
        {value}
        {children}
        {onClick && !children && <ChevronRight size={18} aria-hidden />}
      </span>
    </>
  )
  return (
    <li className="border-b border-line last:border-0">
      {onClick ? (
        <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-body">
          {inner}
        </button>
      ) : (
        <div className="flex min-h-[52px] items-center gap-3 px-4 text-body">{inner}</div>
      )}
    </li>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-line'}`}
    >
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-paper shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

export function ConfirmSheet({ open, onClose, title, body, confirm, onConfirm, danger, loading }: { open: boolean; onClose: () => void; title: string; body?: string; confirm: string; onConfirm: () => void; danger?: boolean; loading?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="px-5 pt-2 pb-5">
        <h2 className="text-title">{title}</h2>
        {body && <p className="mt-2 text-body text-ink-2">{body}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={onConfirm} loading={loading} className={danger ? '!bg-danger !text-white' : undefined}>
            {confirm}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Sheet>
  )
}

export default function Profile() {
  const nav = useNavigate()
  const toast = useToast()
  const { me, signOut, session } = useAuth()
  const update = useUpdateMe()
  const profile = me?.role === 'claimant' ? me.profile : null
  const [edit, setEdit] = useState<'name' | 'phone' | null>(null)
  const [draft, setDraft] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'signout' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [loc, setLoc] = useState(getLocationPref)
  const [locHelp, setLocHelp] = useState(false)

  const phone = profile?.phone_e164 ? parsePhoneNumberFromString(profile.phone_e164) : null
  const country = phone?.country ?? 'PK'

  const save = async () => {
    const err = edit === 'name' ? firstError(nameSchema, draft) : firstError(phoneSchema(country), draft)
    if (err) return setFieldError(err)
    try {
      await update.mutateAsync(edit === 'name' ? { full_name: draft.trim() } : { phone_e164: parsePhoneNumberFromString(draft, country)!.number })
      setEdit(null)
      toast('Saved.')
    } catch (e) {
      setFieldError(e instanceof ApiError ? Object.values(e.fields ?? {})[0] ?? e.message : 'Couldn’t save. Try again.')
    }
  }

  return (
    <Page kind="tab" withNav>
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="text-title">Profile</h1>
      </header>
      <Group>
        <Row label="Name" value={profile?.full_name} onClick={() => (setDraft(profile?.full_name ?? ''), setFieldError(null), setEdit('name'))} />
        <Row label="Email" value={session?.user.email} />
        <Row label="Phone" value={phone?.formatInternational()} onClick={() => (setDraft(phone?.formatNational() ?? ''), setFieldError(null), setEdit('phone'))} />
      </Group>
      <Group title="Settings">
        <Row label="Notifications">
          <Toggle
            label="Notifications"
            checked={!!profile?.notify_push}
            onChange={async (on) => {
              if (on) {
                const r = await enablePush().catch(() => 'denied' as const)
                if (r === 'ios-install') return toast('Add to Home Screen to get notifications.')
                if (r !== 'granted') return toast('Notifications are blocked in your browser settings.')
              } else await disablePush().catch(() => {})
              await update.mutateAsync({ notify_push: on }).catch(() => {})
            }}
          />
        </Row>
        <Row label="Use my location">
          <Toggle
            label="Use my location"
            checked={loc}
            onChange={async (on) => {
              if (on) {
                const ok = await requestLocation()
                if (!ok) return setLocHelp(true)
              }
              setLoc(on)
              setLocationPref(on)
              update.mutate({ use_location: on })
            }}
          />
        </Row>
      </Group>
      {locHelp && (
        <p className="mx-6 mt-2 text-caption text-ink-3">
          Location is blocked for this site. Turn it on in your browser’s site settings, then try again.
        </p>
      )}
      <Group>
        <Row label="Sign out" onClick={() => setConfirm('signout')} />
        <Row label="Delete account" danger onClick={() => setConfirm('delete')} />
      </Group>

      <Sheet open={!!edit} onClose={() => setEdit(null)} label={edit === 'name' ? 'Edit name' : 'Edit phone'}>
        <form className="px-5 pt-2 pb-5" onSubmit={(e) => (e.preventDefault(), save())}>
          <h2 className="mb-4 text-title">{edit === 'name' ? 'Your name' : 'Your phone number'}</h2>
          <Input
            label={edit === 'name' ? 'Full name' : `Phone (${country})`}
            data-autofocus
            value={draft}
            type={edit === 'phone' ? 'tel' : 'text'}
            inputMode={edit === 'phone' ? 'tel' : undefined}
            autoComplete={edit === 'name' ? 'name' : 'tel-national'}
            onChange={(e) => (setDraft(e.target.value), setFieldError(null))}
            error={fieldError}
            helper={edit === 'name' ? 'Staff will use this at pickup.' : 'Only used if staff need to contact you about a pickup.'}
          />
          <Button type="submit" loading={update.isPending} className="mt-2">Save</Button>
        </form>
      </Sheet>

      <ConfirmSheet
        open={confirm === 'signout'}
        onClose={() => setConfirm(null)}
        title="Sign out?"
        confirm="Sign out"
        onConfirm={async () => {
          await signOut()
          nav('/welcome', { replace: true })
        }}
      />
      <ConfirmSheet
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete your account?"
        body="Your requests will be withdrawn. This can’t be undone."
        confirm="Delete account"
        danger
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          try {
            await api.del('/me')
            await signOut()
            nav('/welcome', { replace: true })
          } catch {
            setBusy(false)
            toast('Couldn’t delete your account. Try again.')
          }
        }}
      />
    </Page>
  )
}
