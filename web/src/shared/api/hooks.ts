import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from './client'
import type * as T from './types'

type LatLng = { lat: number; lng: number } | null

export const keys = {
  me: ['me'] as const,
  places: (loc: LatLng) => ['places', loc] as const,
  recent: (loc: LatLng) => ['items', 'recent', loc] as const,
  item: (id: string) => ['items', 'detail', id] as const,
  search: (req: Omit<T.SearchRequest, 'page'>) => ['search', req] as const,
  myClaims: ['claims', 'mine'] as const,
  pickup: (id: string) => ['claims', 'pickup', id] as const,
  dashboard: ['staff', 'dashboard'] as const,
  staffItems: (f: object) => ['staff', 'items', f] as const,
  staffItem: (id: string) => ['staff', 'item', id] as const,
  staffClaims: (id: string) => ['staff', 'item', id, 'claims'] as const,
}

export const useMe = (enabled: boolean) =>
  useQuery({ queryKey: keys.me, queryFn: () => api.get<T.Me>('/me'), enabled, staleTime: 60_000, retry: 1 })

export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<T.Profile>) => api.put<T.Profile>('/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  })
}

export const usePlaces = (loc: LatLng) =>
  useQuery({ queryKey: keys.places(loc), queryFn: () => api.get<{ places: T.Place[] }>(`/places${qs({ lat: loc?.lat, lng: loc?.lng })}`) })

export const useRecent = (loc: LatLng) =>
  useQuery({ queryKey: keys.recent(loc), queryFn: () => api.get<{ items: T.ItemCard[] }>(`/items/recent${qs({ lat: loc?.lat, lng: loc?.lng })}`) })

export const useItem = (id: string) => useQuery({ queryKey: keys.item(id), queryFn: () => api.get<T.ItemPublic>(`/items/${id}`) })

export const useSearch = (req: Omit<T.SearchRequest, 'page'>, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: keys.search(req),
    queryFn: ({ pageParam }) => api.post<T.SearchResponse>('/search', { ...req, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_page ?? undefined,
    enabled,
    placeholderData: keepPreviousData,
  })

export const useMyClaims = (enabled = true) =>
  useQuery({ queryKey: keys.myClaims, queryFn: () => api.get<{ claims: T.MyClaim[] }>('/claims'), enabled })

export const usePickup = (id: string, enabled: boolean) =>
  useQuery({ queryKey: keys.pickup(id), queryFn: () => api.get<T.PickupInfo>(`/claims/${id}/pickup`), enabled })

// ---- staff
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<T.DashboardResponse>('/staff/dashboard') })

export const useStaffItems = (f: { status?: string; location_id?: string; q?: string }) =>
  useInfiniteQuery({
    queryKey: keys.staffItems(f),
    queryFn: ({ pageParam }) => api.get<T.StaffItemsResponse>(`/staff/items${qs({ ...f, page: pageParam })}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_page ?? undefined,
    placeholderData: keepPreviousData,
  })

export const useStaffItem = (id: string) => useQuery({ queryKey: keys.staffItem(id), queryFn: () => api.get<T.StaffItem>(`/staff/items/${id}`) })

export const useStaffClaims = (id: string) =>
  useQuery({ queryKey: keys.staffClaims(id), queryFn: () => api.get<{ claims: T.StaffClaim[] }>(`/staff/items/${id}/claims`) })

/** Invalidate everything a claim or item change can affect. */
export function useInvalidateAll() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['staff'] }),
      qc.invalidateQueries({ queryKey: ['items'] }),
      qc.invalidateQueries({ queryKey: ['claims'] }),
      qc.invalidateQueries({ queryKey: ['search'] }),
      qc.invalidateQueries({ queryKey: ['places'] }),
    ])
}
