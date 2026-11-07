import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

// Read the repo-root .env (service key never reaches the browser; it's only used here, in Node).
const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
export const SUPABASE_URL = env.SUPABASE_URL
export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY

export const STAFF = 'staff@atrium.gumsum.test'
export const newClaimantEmail = (tag: string) => `e2e-${tag}-${Date.now()}@claimant.gumsum.test`

/** Mint a real email OTP through the Admin API (creates the user if needed). */
export async function otpFor(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  const json = await res.json()
  if (!json.email_otp) throw new Error(`No OTP for ${email}: ${JSON.stringify(json)}`)
  return json.email_otp
}

export const REAL_API = process.env.E2E_API === 'real'

/** Open the app with a fresh mock database (real-API runs are reset once by e2e/setup-real.ts). */
export async function freshApp(page: Page) {
  await page.goto('/welcome')
  if (!REAL_API) {
    await page.waitForFunction(() => (window as any).__gumsum)
    await page.evaluate(() => (window as any).__gumsum.resetMock())
  }
  await page.evaluate(() => localStorage.clear())
}

/** Sign in through the real UI. The send-code call is stubbed so no email goes out; verification is real. */
export async function signIn(page: Page, email: string) {
  await page.route('**/auth/v1/otp*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.goto('/welcome')
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const code = await otpFor(email)
  await page.getByLabel('Digit 1').click()
  await page.keyboard.type(code, { delay: 30 })
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 15_000 })
}

export async function signOut(page: Page) {
  const staff = page.url().includes('/staff')
  await page.goto(staff ? '/staff/profile' : '/profile')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible()
}

/** New claimant: sign in, then name, phone and location primer. */
export async function onboardClaimant(page: Page, email: string, name: string) {
  await signIn(page, email)
  await expect(page.getByRole('heading', { name: 'What’s your name?' })).toBeVisible()
  await page.getByLabel('Full name').fill(name)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your phone number' })).toBeVisible()
  await page.getByLabel('Country').selectOption('PK')
  await page.getByLabel('Phone number').fill('3001234567')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'See items found near you' })).toBeVisible()
  await page.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByRole('heading', { name: `Hi ${name.split(' ')[0]}` })).toBeVisible()
}
