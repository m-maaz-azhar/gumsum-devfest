import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../shared/supabase'
import { OTP_LENGTH } from '../config'
import { emailSchema, firstError, MSG } from '../shared/schemas'
import { Button, TextButton } from '../shared/ui/Button'
import { BigInput } from '../shared/ui/Field'
import { OtpInput } from '../shared/ui/OtpInput'
import { StepShell, StepTitle } from '../shared/ui/StepForm'
import { keys } from '../shared/api/hooks'
import { api } from '../shared/api/client'
import type { Me } from '../shared/api/types'
import { vibrate } from '../shared/motion/presets'
import { useAuth } from './AuthProvider'

const RESEND_AFTER = 30
const CODE_TTL_MS = 10 * 60_000
const MAX_ATTEMPTS = 5
const LOCK_MS = 60_000
const TOTAL_STEPS = 5

const maskEmail = (e: string) => {
  const [u, d] = e.split('@')
  return `${u.slice(0, 1)}***@${d}`
}

function authErrorMessage(e: { status?: number; message?: string; code?: string }) {
  if (e.status === 429 || /rate limit/i.test(e.message ?? '')) return 'Too many codes requested. Wait a minute and try again.'
  if (/not authorized|invalid/i.test(e.message ?? '')) return 'We couldn’t send a code to this email. Check it and try again.'
  return 'Couldn’t send the code. Check your connection and try again.'
}

export default function SignIn() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { expired, clearExpired } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(() => sessionStorage.getItem('gumsum:email') ?? '')
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const attempts = useRef(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [notice, setNotice] = useState<string | null>(expired ? 'Please sign in again.' : null)

  useEffect(() => {
    if (expired) clearExpired()
  }, [expired, clearExpired])

  useEffect(() => {
    if (step !== 'code') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [step])

  const liveEmailError = emailTouched ? firstError(emailSchema, email) : null

  async function send(target = email) {
    const err = firstError(emailSchema, target)
    if (err) {
      setEmailTouched(true)
      setEmailError(err)
      setShake((s) => s + 1)
      return false
    }
    const clean = emailSchema.parse(target)
    setSending(true)
    setEmailError(null)
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } })
    setSending(false)
    if (error) {
      setEmailError(authErrorMessage(error))
      setShake((s) => s + 1)
      return false
    }
    sessionStorage.setItem('gumsum:email', clean)
    setEmail(clean)
    setSentAt(Date.now())
    setNow(Date.now())
    return true
  }

  async function verify(token: string) {
    if (Date.now() < lockedUntil || verifying) return
    setVerifying(true)
    setCodeError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      setVerifying(false)
      setCode('')
      vibrate(10)
      setShake((s) => s + 1)
      if (Date.now() - sentAt > CODE_TTL_MS) {
        setCodeError(MSG.otpExpired)
        attempts.current = 0
        void send()
        return
      }
      attempts.current += 1
      if (attempts.current >= MAX_ATTEMPTS) {
        attempts.current = 0
        setLockedUntil(Date.now() + LOCK_MS)
        setCodeError('Too many tries. Wait 60 seconds and try again.')
      } else setCodeError(MSG.otpWrong)
      return
    }
    // Resolve the role before routing so staff skip claimant onboarding (STF-AUTH-01).
    try {
      const me = await qc.fetchQuery({ queryKey: keys.me, queryFn: () => api.get<Me>('/me') })
      sessionStorage.removeItem('gumsum:email')
      if (me.role === 'staff') nav('/staff', { replace: true })
      else nav(me.needs_onboarding ? '/onboarding/name' : '/', { replace: true })
    } catch {
      setVerifying(false)
      setCodeError('Couldn’t load your account. Try again.')
    }
  }

  const resendIn = Math.max(0, RESEND_AFTER - Math.floor((now - sentAt) / 1000))
  const lockIn = Math.max(0, Math.ceil((lockedUntil - now) / 1000))

  if (step === 'email')
    return (
      <StepShell
        stepKey="email"
        step={1}
        total={TOTAL_STEPS}
        onBack={() => nav('/welcome')}
        footer={
          <Button
            loading={sending}
            disabled={!email.trim()}
            onClick={async () => {
              if (await send()) {
                setCode('')
                setCodeError(null)
                setStep('code')
              }
            }}
          >
            Continue
          </Button>
        }
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (await send()) setStep('code')
          }}
        >
          {notice && <p className="mb-6 rounded-input bg-fill px-4 py-3 text-callout">{notice}</p>}
          <StepTitle>What’s your email?</StepTitle>
          <BigInput
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoFocus
            placeholder="name@example.com"
            value={email}
            maxLength={254}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailError(null)
              setNotice(null)
            }}
            onBlur={() => email && setEmailTouched(true)}
            error={emailError ?? liveEmailError}
            helper="We’ll send you a 6-digit code. No password needed."
            shakeKey={shake}
          />
          <button type="submit" hidden />
        </form>
      </StepShell>
    )

  return (
    <StepShell
      stepKey="code"
      step={2}
      total={TOTAL_STEPS}
      onBack={() => setStep('email')}
      footer={
        <Button loading={verifying} disabled={code.length !== OTP_LENGTH || lockIn > 0} onClick={() => verify(code)}>
          Continue
        </Button>
      }
    >
      <StepTitle sub={<>Enter the code sent to <span className="font-medium text-ink">{maskEmail(email)}</span></>}>Check your email</StepTitle>
      <OtpInput
        label="Verification code"
        length={OTP_LENGTH}
        value={code}
        onChange={(v) => {
          setCode(v)
          setCodeError(null)
        }}
        onComplete={verify}
        error={!!codeError}
        shakeKey={shake}
        disabled={verifying || lockIn > 0}
        autoFocus
      />
      <p className="mt-3 min-h-[18px] text-caption text-danger" aria-live="polite">
        {lockIn > 0 ? `Too many tries. Wait ${lockIn} seconds and try again.` : codeError}
      </p>
      <div className="mt-6 flex items-center justify-between">
        <TextButton onClick={() => setStep('email')}>Change email</TextButton>
        {resendIn > 0 ? (
          <span className="text-callout text-ink-3 tabular">Resend in 0:{String(resendIn).padStart(2, '0')}</span>
        ) : (
          <TextButton
            onClick={async () => {
              if (await send()) setCodeError(null)
            }}
          >
            Resend code
          </TextButton>
        )}
      </div>
    </StepShell>
  )
}
