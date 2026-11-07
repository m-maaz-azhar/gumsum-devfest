import { expect, test } from '@playwright/test'
import { newClaimantEmail, onboardClaimant, signIn, signOut, STAFF } from './helpers'

// Run against a deployment: BASE_URL=https://gumsum.vercel.app npx playwright test smoke.prod
test.skip(!process.env.BASE_URL, 'production smoke only')

test('production: staff and claimant can sign in; service worker registers', async ({ page }) => {
  await signIn(page, STAFF)
  await expect(page.getByText('Atrium Mall · Staff')).toBeVisible()
  await expect(page.getByText('To review')).toBeVisible()
  await signOut(page)
  await onboardClaimant(page, newClaimantEmail('prod'), 'Prod Check')
  await page.getByRole('link', { name: /Black backpack/ }).first().click()
  await expect(page.getByRole('button', { name: 'This is mine' })).toBeVisible()
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))
  expect(sw).toBe(true)
})
