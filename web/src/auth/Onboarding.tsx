import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, AsYouType } from 'libphonenumber-js/min'
import { ChevronDown, MapPin } from 'lucide-react'
import { nameSchema, phoneSchema, firstError } from '../shared/schemas'
import { useUpdateMe } from '../shared/api/hooks'
import { Button, TextButton } from '../shared/ui/Button'
import { BigInput, FieldMessage } from '../shared/ui/Field'
import { StepShell, StepTitle } from '../shared/ui/StepForm'
import { ApiError } from '../shared/api/client'
import { useAuth } from './AuthProvider'
import { requestLocation, setLocationPref } from '../shared/location'

const TOTAL = 5

export function NameStep() {
  const nav = useNavigate()
  const { me } = useAuth()
  const initial = me?.role === 'claimant' ? me.profile?.full_name ?? '' : ''
  const [name, setName] = useState(initial)
  const [touched, setTouched] = useState(false)
  const [shake, setShake] = useState(0)
  const [serverError, setServerError] = useState<string | null>(null)
  const update = useUpdateMe()
  const error = serverError ?? (touched ? firstError(nameSchema, name) : null)

  const submit = async () => {
    setTouched(true)
    if (firstError(nameSchema, name)) return setShake((s) => s + 1)
    try {
      await update.mutateAsync({ full_name: name.trim() })
      nav('/onboarding/phone')
    } catch (e) {
      setServerError(e instanceof ApiError ? e.fields?.full_name ?? e.message : 'Couldn’t save. Try again.')
      setShake((s) => s + 1)
    }
  }

  return (
    <StepShell stepKey="name" step={3} total={TOTAL} footer={<Button loading={update.isPending} disabled={!name.trim()} onClick={submit}>Continue</Button>}>
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <StepTitle>What’s your name?</StepTitle>
        <BigInput
          label="Full name"
          autoFocus
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Full name"
          maxLength={50}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setServerError(null)
          }}
          onBlur={() => name && setTouched(true)}
          error={error}
          helper="Staff will use this at pickup."
          shakeKey={shake}
        />
        <button type="submit" hidden />
      </form>
    </StepShell>
  )
}

// Time zone is a better hint than language (an en-US phone in Karachi should default to Pakistan).
const TZ_REGION: Record<string, string> = {
  'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM',
  'Asia/Kabul': 'AF', 'Asia/Tehran': 'IR', 'Europe/Istanbul': 'TR', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Australia/Sydney': 'AU',
}

function defaultRegion() {
  const countries = getCountries() as string[]
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (TZ_REGION[tz]) return TZ_REGION[tz]
    if (tz.startsWith('America/')) {
      const r = (navigator.language || '').split('-')[1]?.toUpperCase()
      if (r && countries.includes(r)) return r
    }
  } catch {
    /* fall through */
  }
  const region = (navigator.language || '').split('-')[1]?.toUpperCase()
  return region && countries.includes(region) && region !== 'US' ? region : 'PK'
}

export function PhoneStep() {
  const nav = useNavigate()
  const [country, setCountry] = useState(defaultRegion)
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const [shake, setShake] = useState(0)
  const [serverError, setServerError] = useState<string | null>(null)
  const update = useUpdateMe()
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' })
    return getCountries()
      .map((c) => ({ code: c, name: names.of(c) ?? c, dial: getCountryCallingCode(c) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [])
  const error = serverError ?? (touched ? firstError(phoneSchema(country), phone) : null)

  const submit = async () => {
    setTouched(true)
    if (firstError(phoneSchema(country), phone)) return setShake((s) => s + 1)
    const e164 = parsePhoneNumberFromString(phone, country as never)!.number
    try {
      await update.mutateAsync({ phone_e164: e164 })
      nav('/onboarding/location')
    } catch (e) {
      setServerError(e instanceof ApiError ? e.fields?.phone_e164 ?? e.message : 'Couldn’t save. Try again.')
      setShake((s) => s + 1)
    }
  }

  return (
    <StepShell
      stepKey="phone"
      step={4}
      total={TOTAL}
      onBack={() => nav('/onboarding/name')}
      footer={<Button loading={update.isPending} disabled={!phone.trim()} onClick={submit}>Continue</Button>}
    >
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <StepTitle>Your phone number</StepTitle>
        <div className="flex items-end gap-3">
          <label className="relative shrink-0">
            <span className="sr-only">Country</span>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                setServerError(null)
              }}
              aria-label="Country"
              className="appearance-none rounded-none border-0 border-b-2 border-line bg-transparent pr-7 pb-2 text-[1.75rem] leading-9 text-ink outline-none transition-colors focus:border-ink"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} +{c.dial}
                </option>
              ))}
            </select>
            <ChevronDown size={20} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute right-0 bottom-3.5 text-ink-3" />
          </label>
          <BigInput
            label="Phone number"
            className="min-w-0 flex-1"
            bare
            aria-describedby="phone-msg"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            autoFocus
            placeholder="300 1234567"
            value={phone}
            onChange={(e) => {
              setPhone(new AsYouType(country as never).input(e.target.value))
              setServerError(null)
            }}
            onBlur={() => phone && setTouched(true)}
            error={error}
            shakeKey={shake}
          />
        </div>
        <FieldMessage id="phone-msg" error={error} helper="Only used if staff need to contact you about a pickup." />
        <button type="submit" hidden />
      </form>
    </StepShell>
  )
}

export function LocationStep() {
  const nav = useNavigate()
  const update = useUpdateMe()
  const [busy, setBusy] = useState(false)
  const finish = () => nav('/', { replace: true })
  return (
    <StepShell
      stepKey="location"
      step={5}
      total={TOTAL}
      onBack={() => nav('/onboarding/phone')}
      footer={
        <div className="flex flex-col items-center gap-2">
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true)
              const ok = await requestLocation()
              setLocationPref(ok)
              await update.mutateAsync({ use_location: ok }).catch(() => {})
              finish()
            }}
          >
            Allow location
          </Button>
          <TextButton
            onClick={() => {
              setLocationPref(false)
              finish()
            }}
          >
            Not now
          </TextButton>
        </div>
      }
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill">
        <MapPin size={28} strokeWidth={1.75} aria-hidden />
      </div>
      <div className="mt-8">
        <StepTitle sub="We use your location only while the app is open.">See items found near you</StepTitle>
      </div>
    </StepShell>
  )
}
