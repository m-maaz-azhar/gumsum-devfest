import { API_URL, USE_MOCK_API } from '../../config'
import { supabase } from '../supabase'
import type { ApiErrorBody } from './types'

export class ApiError extends Error {
  status: number
  code: string
  fields?: Record<string, string>
  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message)
    this.status = status
    this.code = body.code
    this.fields = body.fields
  }
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (USE_MOCK_API) {
    const { mockFetch } = await import('../../mock/server')
    return mockFetch<T>(method, path, body, session)
  }
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Check your connection and try again.' })
  }
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, json?.error ?? { code: 'HTTP_' + res.status, message: 'Something went wrong. Try again.' })
  }
  // The Flask API wraps every success body as { data: ... }.
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export function qs(params: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
