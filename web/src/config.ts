export const APP_NAME = 'Gumsum'

const env = import.meta.env

export const SUPABASE_URL = env.VITE_SUPABASE_URL as string
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY as string
/** Flask base URL ending in /v1. Empty means the built-in mock API runs instead. */
export const API_URL = ((env.VITE_API_URL as string) || '').replace(/\/$/, '')
export const USE_MOCK_API = !API_URL
export const VAPID_PUBLIC_KEY = (env.VITE_VAPID_PUBLIC_KEY as string) || ''
/** Length of the Supabase email code. The spec says 6; this project currently sends 8. */
export const OTP_LENGTH = Number(env.VITE_OTP_LENGTH || 6)
