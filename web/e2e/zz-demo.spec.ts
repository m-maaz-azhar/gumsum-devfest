import { expect, test } from '@playwright/test'
import { newClaimantEmail, otpFor, STAFF } from './helpers'

test.use({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, video: { mode: 'on', size: { width: 400, height: 860 } }, launchOptions: { executablePath: '/usr/bin/chromium', slowMo: 250 } })
test.setTimeout(300_000)
const pause = (p: any, ms = 1400) => p.waitForTimeout(ms)
async function signIn(page: any, email: string) {
  await page.route('**/auth/v1/otp*', (r: any) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.goto('/welcome'); await pause(page, 1800)
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByLabel('Email').pressSequentially(email, { delay: 40 }); await pause(page, 600)
  await page.getByRole('button', { name: 'Continue' }).click(); await pause(page)
  await page.getByLabel('Digit 1').click(); await page.keyboard.type(await otpFor(email), { delay: 150 })
  await page.waitForURL((u: URL) => !u.pathname.startsWith('/sign-in'), { timeout: 20_000 })
}
async function signOut(page: any, staff = false) {
  await page.goto(staff ? '/staff/profile' : '/profile'); await pause(page, 800)
  await page.getByRole('button', { name: 'Sign out' }).click(); await pause(page, 600)
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click(); await pause(page, 800)
}
test('demo', async ({ page }) => {
  const email = newClaimantEmail('demo').replace('e2e-demo-', 'e2e-maryam-')
  // Claimant onboarding
  await signIn(page, email)
  await page.getByLabel('Full name').pressSequentially('Maryam Ali', { delay: 60 }); await page.getByRole('button', { name: 'Continue' }).click(); await pause(page)
  await page.getByLabel('Phone number').pressSequentially('3001234567', { delay: 60 }); await page.getByRole('button', { name: 'Continue' }).click(); await pause(page)
  await page.getByRole('button', { name: 'Not now' }).click(); await pause(page, 2500)
  // Search
  await page.getByRole('button', { name: 'Search for your item' }).click(); await pause(page, 800)
  await page.getByRole('searchbox').pressSequentially('blue phone in atrium mall', { delay: 60 }); await page.keyboard.press('Enter'); await pause(page, 3500)
  await page.getByRole('link', { name: /Blue iPhone/ }).first().click(); await pause(page, 2500)
  await page.getByRole('button', { name: /Photo 1 of/ }).hover(); await pause(page, 800)
  // Claim chat with live AI
  await page.getByRole('button', { name: 'This is mine' }).click(); await pause(page, 1500)
  const sheet = page.getByRole('dialog', { name: 'Claim this item' })
  await sheet.getByLabel('Your answer').pressSequentially('It is my blue iPhone. The camera lens rings are scratched and my home screen has a Karachi weather widget.', { delay: 25 })
  await sheet.getByRole('button', { name: 'Send' }).click()
  const done = sheet.getByText('Request submitted')
  for (let i = 0; i < 3; i++) {
    await expect(done.or(sheet.getByRole('button', { name: 'I don’t know' }))).toBeVisible({ timeout: 40_000 }); await pause(page, 2500)
    if (await done.isVisible()) break
    await sheet.getByLabel('Your answer').pressSequentially('There is a small chip on the bottom-left corner of the back glass.', { delay: 25 })
    await sheet.getByRole('button', { name: 'Send' }).click()
  }
  await pause(page, 3000)
  await sheet.getByRole('button', { name: 'See my requests' }).click(); await pause(page, 3000)
  await signOut(page)
  // Staff review
  await signIn(page, STAFF); await pause(page, 3000)
  await page.goto('/staff/items/17e00000-0000-4000-8000-000000000001'); await pause(page, 2000)
  const row = page.getByRole('tabpanel').getByRole('button').filter({ hasText: 'Maryam Ali' })
  await expect(row).toContainText(/High|Medium|Low/, { timeout: 60_000 }); await pause(page, 2500)
  await row.click(); await pause(page, 3500)
  const review = page.getByRole('dialog', { name: 'Claim review' })
  await review.getByRole('button', { name: 'Approve' }).click(); await pause(page, 1200)
  await page.getByRole('dialog', { name: /Approve Maryam/ }).getByRole('button', { name: 'Approve' }).click(); await pause(page, 3000)
  await signOut(page, true)
  // Claimant pickup card
  await signIn(page, email); await pause(page, 1500)
  await page.getByRole('link', { name: 'Requests' }).click(); await pause(page, 2000)
  await page.getByRole('link', { name: /Blue iPhone/ }).click(); await pause(page, 3500)
  const code = (await page.getByLabel(/^Pickup code/).getAttribute('aria-label'))!.replace(/\D/g, '')
  await signOut(page)
  // Staff handover
  await signIn(page, STAFF); await pause(page, 1500)
  await page.getByRole('link', { name: 'Pickup' }).click(); await pause(page, 1500)
  await page.getByRole('button', { name: 'Enter code instead' }).click(); await pause(page, 800)
  await page.getByLabel('Digit 1').click(); await page.keyboard.type(code, { delay: 180 }); await pause(page, 2500)
  await page.getByRole('dialog', { name: 'Confirm pickup' }).getByRole('button', { name: 'Hand over' }).click(); await pause(page, 3500)
  await page.goto('/staff'); await pause(page, 3500)
})
