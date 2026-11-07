import { useEffect, useState } from 'react'

const PREF = 'gumsum:use-location'
export type LatLng = { lat: number; lng: number }

export const getLocationPref = () => {
  try {
    return localStorage.getItem(PREF) === '1'
  } catch {
    return false
  }
}
export const setLocationPref = (on: boolean) => {
  try {
    localStorage.setItem(PREF, on ? '1' : '0')
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event('gumsum:location-pref'))
}

/** Ask the browser for a position; resolves false on deny, timeout or no support. */
export function requestLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(false)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        sessionStorage.setItem('gumsum:last-pos', JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }))
        resolve(true)
      },
      () => resolve(false),
      { timeout: 10_000, maximumAge: 300_000 },
    )
  })
}

/** Current position while the app is open, only when the user opted in. */
export function useUserLocation(): { loc: LatLng | null; enabled: boolean } {
  const [enabled, setEnabled] = useState(getLocationPref)
  const [loc, setLoc] = useState<LatLng | null>(() => {
    try {
      return enabled ? JSON.parse(sessionStorage.getItem('gumsum:last-pos') ?? 'null') : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    const onPref = () => setEnabled(getLocationPref())
    window.addEventListener('gumsum:location-pref', onPref)
    return () => window.removeEventListener('gumsum:location-pref', onPref)
  }, [])
  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setLoc(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 }
        sessionStorage.setItem('gumsum:last-pos', JSON.stringify(next))
        setLoc(next)
      },
      () => setLoc(null),
      { timeout: 10_000, maximumAge: 300_000 },
    )
  }, [enabled])
  return { loc, enabled }
}
