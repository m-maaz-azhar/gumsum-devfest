import { expect, test } from '@playwright/test'
import { freshApp, newClaimantEmail, onboardClaimant, otpFor, signIn, signOut, STAFF } from './helpers'

test.describe('Auth and roles (USR-ONB-01..06, STF-AUTH-01)', () => {
  test.beforeEach(async ({ page }) => freshApp(page))

  test('new claimant: email → code → name → phone → location → Home', async ({ page }) => {
    await onboardClaimant(page, newClaimantEmail('onb'), 'Zara Ahmed')
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  test('validation: bad email, wrong code, bad name and phone', async ({ page }) => {
    await page.route('**/auth/v1/otp*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Enter a valid email, like name@example.com.')).toBeVisible()

    const email = newClaimantEmail('val')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText(/Enter the code sent to e\*\*\*@claimant/)).toBeVisible()
    await expect(page.getByText(/Resend in 0:/)).toBeVisible()
    await otpFor(email) // make sure the user exists
    await page.getByLabel('Digit 1').click()
    await page.keyboard.type('00000000'.slice(0, await page.getByRole('group', { name: 'Verification code' }).locator('input').count()))
    await expect(page.getByText('That code isn’t right. Try again.')).toBeVisible()

    await page.getByLabel('Digit 1').click()
    await page.keyboard.type(await otpFor(email))
    await expect(page.getByRole('heading', { name: 'What’s your name?' })).toBeVisible()
    await page.getByLabel('Full name').fill('A')
    await page.getByLabel('Full name').blur()
    await expect(page.getByText('Enter your name as it appears on your ID.')).toBeVisible()
    await page.getByLabel('Full name').fill('Ali Khan')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel('Phone number').fill('123')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Enter a valid phone number.')).toBeVisible()
  })

  test('staff land on Staff Home and skip onboarding; guards redirect by role', async ({ page }) => {
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByText('Atrium Mall · Staff')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Staff' })).toBeVisible()
    await page.goto('/requests')
    await expect(page).toHaveURL(/\/staff$/)
    await signOut(page)
  })

  test('claimant opening a staff URL goes Home; session persists across reloads; sign out', async ({ page }) => {
    await onboardClaimant(page, newClaimantEmail('guard'), 'Noor Fatima')
    await page.goto('/staff/items')
    await expect(page).toHaveURL(/\/$/)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Hi Noor' })).toBeVisible()
    await signOut(page)
    await page.goto('/requests')
    await expect(page).toHaveURL(/\/welcome$/)
  })
})
