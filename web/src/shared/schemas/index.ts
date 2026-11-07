// Validation Rules sheet → Zod. Error copy is quoted from the sheet so every screen says the same thing.
import { z } from 'zod'
import { isValidPhoneNumber } from 'libphonenumber-js/min'

export const MSG = {
  email: 'Enter a valid email, like name@example.com.',
  otpWrong: 'That code isn’t right. Try again.',
  otpExpired: 'This code expired. We’ve sent a new one.',
  name: 'Enter your name as it appears on your ID.',
  phone: 'Enter a valid phone number.',
  title: 'Give the item a short name, like ‘Black backpack’.',
  tags: 'Tags must be 2 to 24 characters.',
  location: 'Choose where it was found.',
  spot: 'Keep it under 80 characters.',
  foundAt: 'Date can’t be in the future.',
  privateShort: 'Add a few more details so we can verify the owner.',
  privateTip: 'Tip: list at least 3 separate details.',
  claimShort: 'Add a bit more detail.',
  moderation: 'Please keep it respectful.',
  photosMin: 'Add at least 2 photos.',
  reason: 'Choose a reason.',
  otherReason: 'Add 5 to 200 characters.',
  pickupInvalid: 'That code doesn’t match any pickup.',
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, MSG.email)
  .pipe(z.email({ message: MSG.email }))

export const nameSchema = z
  .string()
  .trim()
  .min(2, MSG.name)
  .max(50, MSG.name)
  .regex(/^[\p{L}][\p{L}\s'’-]*[\p{L}]$/u, MSG.name)

export const phoneSchema = (country: string) =>
  z.string().refine((v) => {
    try {
      return isValidPhoneNumber(v, country as never)
    } catch {
      return false
    }
  }, MSG.phone)

export const titleSchema = z
  .string()
  .trim()
  .min(3, MSG.title)
  .max(60, MSG.title)
  .refine((v) => /[\p{L}\p{N}]/u.test(v), MSG.title)

export const tagSchema = z.string().trim().min(2, MSG.tags).max(24, MSG.tags)
export const spotSchema = z.string().trim().max(80, MSG.spot)
export const foundAtSchema = z.string().refine((v) => !v || new Date(v).getTime() <= Date.now() + 60_000, MSG.foundAt)
export const privateSchema = z.string().trim().min(20, MSG.privateShort).max(1000, MSG.privateShort)
export const claimMessageSchema = z.string().trim().min(15, MSG.claimShort).max(1000, MSG.claimShort)
export const followupSchema = z.string().trim().min(1).max(500)
export const searchSchema = z.string().trim().min(2).max(100)

/** Soft check (STF-ITEM-04): fewer than 3 details detected (no commas or line breaks). */
export const looksLikeFewDetails = (s: string) => s.trim().length >= 20 && s.split(/[,\n;]+/).filter((x) => x.trim()).length < 3

export function firstError(schema: z.ZodType, value: unknown): string | null {
  const r = schema.safeParse(value)
  return r.success ? null : r.error.issues[0]?.message ?? 'Check this field.'
}
