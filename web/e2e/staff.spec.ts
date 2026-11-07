import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { freshApp, newClaimantEmail, onboardClaimant, signIn, signOut, STAFF } from './helpers'

const photo = (n: string) => fileURLToPath(new URL(`../public/seed/${n}`, import.meta.url))

async function addItem(page: Page, title: string, secret: string) {
  await page.getByRole('link', { name: 'Add found item' }).click()
  await expect(page.getByRole('heading', { name: 'Add photos' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  await page.getByTestId('gallery-input').setInputFiles([photo('keys-1.jpg')])
  await expect(page.getByText('1 of 6 photos')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  await page.getByTestId('gallery-input').setInputFiles([photo('keys-2.jpg')])
  await expect(page.getByText('2 of 6 photos')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled()
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('heading', { name: 'What is it?' })).toBeVisible()
  await page.getByLabel('Title').fill('ab')
  await page.getByLabel('Title').blur()
  await expect(page.getByText('Give the item a short name, like ‘Black backpack’.')).toBeVisible()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Add a tag').fill('purple')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('heading', { name: 'Where was it found?' })).toBeVisible()
  await page.getByLabel('Place').selectOption({ label: 'Atrium Cinema' })
  await page.getByLabel(/Exact spot/).fill('Screen 1 lobby')
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('heading', { name: 'What would only the owner know?' })).toBeVisible()
  await expect(page.getByText('Only your team and the AI can see this.')).toBeVisible()
  await page.getByLabel('Private description').fill('too short')
  await page.getByLabel('Private description').blur()
  await expect(page.getByText('Add a few more details so we can verify the owner.')).toBeVisible()
  await page.getByLabel('Private description').fill(secret)
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('heading', { name: 'Check and publish' })).toBeVisible()
  await expect(page.getByText('Screen 1 lobby')).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('heading', { name: 'Item published' })).toBeVisible()
}

test.describe('Staff', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page)
  })

  test('dashboard, add item (photos → review → publish), items list, secret behind Show', async ({ page }) => {
    await signIn(page, STAFF)
    await expect(page.getByText('To review')).toBeVisible()
    await expect(page.getByRole('link', { name: /Black backpack/ })).toBeVisible() // needs attention: 3 claims
    await addItem(page, 'Purple umbrella hat', 'Smiley badge pinned on the brim, torn label inside, a coffee stain on one side')
    await page.getByRole('button', { name: 'View item' }).click()
    await expect(page.getByRole('heading', { name: 'Purple umbrella hat' })).toBeVisible()
    await page.getByRole('tab', { name: 'details' }).click()
    await expect(page.getByText('Smiley badge')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show' }).click()
    await expect(page.getByText(/Smiley badge pinned/)).toBeVisible()
    await page.getByRole('tab', { name: 'activity' }).click()
    await expect(page.getByText('Item logged')).toBeVisible()

    await page.goto('/staff/items')
    await page.getByRole('searchbox', { name: 'Search items' }).fill('purple')
    await expect(page.getByRole('link', { name: /Purple umbrella hat/ })).toBeVisible()
  })

  test('claims are ranked by score; reject needs a reason; contradiction flagged', async ({ page }) => {
    await signIn(page, STAFF)
    await page.goto('/staff/items/17e00000-0000-4000-8000-000000000001')
    const rows = page.getByRole('tabpanel').getByRole('button')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('Sara Malik')
    await expect(rows.nth(0)).toContainText('88')
    await expect(rows.nth(2)).toContainText('Omar Siddiqui')
    await expect(page.getByLabel('Contradiction')).toBeVisible()

    await rows.nth(2).click()
    const review = page.getByRole('dialog', { name: 'Claim review' })
    await expect(review.getByText('Contradiction:').first()).toBeVisible()
    await expect(review.getByText('Black backpack with my laptop')).toBeVisible()
    await review.getByRole('button', { name: 'Reject' }).click()
    const reject = page.getByRole('dialog', { name: 'Reject claim' })
    await expect(reject.getByRole('button', { name: 'Reject claim' })).toBeDisabled()
    await reject.getByRole('radio', { name: 'Suspected false claim' }).click()
    await reject.getByRole('button', { name: 'Reject claim' }).click()
    await expect(page.getByText('Rejected. Omar has been notified.')).toBeVisible()
    await expect(rows.nth(2)).toContainText('Rejected')
  })

  test('full loop: claim → score → approve → pickup code → hand over → collected', async ({ page }) => {
    const email = newClaimantEmail('loop')
    // 1. Claimant claims the earbuds with strong details
    await onboardClaimant(page, email, 'Maryam Ali')
    await page.goto('/items/17e00000-0000-4000-8000-000000000002')
    await page.getByRole('button', { name: 'This is mine' }).click()
    const sheet = page.getByRole('dialog', { name: 'Claim this item' })
    await sheet
      .getByLabel('Your answer')
      .fill('My white AirPods case. The left earbud has a tiny chip on the stem, a yellow star sticker on the back, and M.A. initials engraved on the lid.')
    await sheet.getByRole('button', { name: 'Send' }).click()
    await expect(sheet.getByText('Request submitted')).toBeVisible()
    await signOut(page)

    // 2. Staff sees it ranked first with a High score, approves
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/staff$/)
    await page.goto('/staff/items/17e00000-0000-4000-8000-000000000002')
    const first = page.getByRole('tabpanel').getByRole('button').first()
    await expect(first).toContainText('Maryam Ali', { timeout: 15_000 })
    await expect(first).toContainText('High', { timeout: 15_000 })
    await first.click()
    const review = page.getByRole('dialog', { name: 'Claim review' })
    await expect(review.getByText('Matched:').first()).toBeVisible()
    await review.getByRole('button', { name: 'Approve' }).click()
    await page.getByRole('dialog', { name: 'Approve Maryam’s claim?' }).getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText('Approved. Maryam has been notified.')).toBeVisible()
    await expect(page.getByText('Ready for pickup').first()).toBeVisible()
    await signOut(page)

    // 3. Claimant: Approved badge + pickup card with QR and code
    await signIn(page, email)
    await expect(page.getByLabel('New update')).toBeVisible()
    await page.getByRole('link', { name: 'Requests' }).click()
    await expect(page.getByText('Approved')).toBeVisible()
    await page.getByRole('link', { name: /White earbuds case/ }).click()
    await expect(page.getByText('Good news! Your item is ready for pickup.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show QR code full screen' })).toBeVisible()
    const code = (await page.getByLabel(/^Pickup code/).getAttribute('aria-label'))!.replace(/\D/g, '')
    expect(code).toHaveLength(6)
    await signOut(page)

    // 4. Staff verifies the code at the desk and hands over
    await signIn(page, STAFF)
    await expect(page).toHaveURL(/\/staff$/)
    await page.getByRole('link', { name: 'Pickup' }).click()
    await page.getByRole('button', { name: 'Enter code instead' }).click()
    await page.getByLabel('Digit 1').click()
    await page.keyboard.type('000000')
    await expect(page.getByText('That code doesn’t match any pickup.')).toBeVisible()
    await page.getByLabel('Digit 1').click()
    await page.keyboard.type(code)
    const confirm = page.getByRole('dialog', { name: 'Confirm pickup' })
    await expect(confirm.getByText('Maryam Ali')).toBeVisible()
    await expect(confirm.getByText('Phone ends in 4567')).toBeVisible()
    await confirm.getByRole('button', { name: 'Hand over' }).click()
    await expect(confirm.getByText('Returned')).toBeVisible()
    await confirm.getByRole('button', { name: 'Next pickup' }).click()
    // Reusing the code is refused
    await page.getByLabel('Digit 1').click()
    await page.keyboard.type(code)
    await expect(page.getByText('This item was already collected.')).toBeVisible()
    await page.goto('/staff')
    await expect(page.getByText('1 returned in the last 7 days')).toBeVisible()
    await signOut(page)

    // 5. Claimant sees Collected
    await signIn(page, email)
    await page.getByRole('link', { name: 'Requests' }).click()
    await expect(page.getByText('Collected')).toBeVisible()
  })
})
