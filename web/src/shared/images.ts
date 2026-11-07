import { USE_MOCK_API } from '../config'
import { supabase } from './supabase'
import type { SignedUpload } from './api/types'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
export const MAX_BYTES = 10 * 1024 * 1024

/** PHOTO rule from the Validation Rules sheet. Returns an error message or null. */
export function photoError(file: File): string | null {
  const okType = ACCEPTED_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name)
  if (!okType) return 'Use a JPG, PNG, WEBP or HEIC photo.'
  if (file.size > MAX_BYTES) return 'This photo is over 10 MB.'
  return null
}

/**
 * Resize to at most 2048px on the long edge and re-encode as JPEG. Re-encoding through a canvas drops
 * all EXIF data, including GPS (NFR-03). Formats the browser can't decode (HEIC outside Safari) are sent as-is.
 */
export async function prepareImage(file: File, maxEdge = 2048): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.86))
}

/** Upload to a signed URL issued by the API (real mode) or into the mock store. */
export async function uploadToSigned(target: SignedUpload, blob: Blob) {
  if (USE_MOCK_API) {
    const { mockUpload } = await import('../mock/server')
    return mockUpload(target.path, blob)
  }
  const { error } = await supabase.storage.from('item-photos').uploadToSignedUrl(target.path, target.token, blob, {
    contentType: blob.type || 'image/jpeg',
  })
  if (error) throw error
}
