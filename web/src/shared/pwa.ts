import { useEffect, useState } from 'react'
import { api } from './api/client'
import { VAPID_PUBLIC_KEY } from '../config'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  // When a new deploy's service worker takes control, reload once so the page runs the new code
  // instead of the previously cached bundle. Skipped on the very first install (no old controller).
  const hadController = !!navigator.serviceWorker.controller
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return
    reloaded = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Check for a new version whenever the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}))
      })
      .catch(() => {})
  })
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// ---- install prompt (USR-PWA-02)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let deferred: BeforeInstallPromptEvent | null = null
const subs = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    subs.forEach((s) => s())
  })
}

const DISMISS_KEY = 'gumsum:install-dismissed'
const SUBMITTED_KEY = 'gumsum:first-claim'

export const markFirstClaimSubmitted = () => {
  try {
    localStorage.setItem(SUBMITTED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const s = () => force((n) => n + 1)
    subs.add(s)
    return () => void subs.delete(s)
  }, [])
  let dismissedAt = 0
  let submitted = false
  try {
    dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    submitted = localStorage.getItem(SUBMITTED_KEY) === '1'
  } catch {
    /* ignore */
  }
  const recentlyDismissed = Date.now() - dismissedAt < 7 * 86_400_000
  const eligible = submitted && !isStandalone() && !recentlyDismissed
  return {
    canPrompt: eligible && !!deferred,
    showIOSHint: eligible && isIOS() && !deferred,
    prompt: async () => {
      if (!deferred) return
      await deferred.prompt()
      deferred = null
      force((n) => n + 1)
    },
    dismiss: () => {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } catch {
        /* ignore */
      }
      force((n) => n + 1)
    },
  }
}

// ---- web push (USR-NOT-01)
const urlBase64ToUint8Array = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Ask permission and subscribe. Returns 'granted' | 'denied' | 'unsupported' | 'ios-install'. */
export async function enablePush(): Promise<'granted' | 'denied' | 'unsupported' | 'ios-install'> {
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  if (!VAPID_PUBLIC_KEY) {
    await api.post('/push/subscribe', { endpoint: 'pending-vapid-key', keys: {} }).catch(() => {})
    return 'granted'
  }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
  await api.post('/push/subscribe', sub.toJSON())
  return 'granted'
}

export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await api.del('/push/subscribe').catch(() => {})
    await sub.unsubscribe()
  }
}
