import { expect, test } from '@playwright/test'
import { freshApp, newClaimantEmail, onboardClaimant } from './helpers'

const SECRET_WORDS = ['nike', 'cat', 'keychain', 'scratch', 'zip', 'bottle']

test.describe('Claimant: home, search, item, claim chat, requests', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page)
    await onboardClaimant(page, newClaimantEmail('clm'), 'Sana Iqbal')
  })

  test('home shows places and recently found items; place screen lists its items', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Choose a place' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Atrium Mall\s+\d+ items/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Black smartphone/ })).toBeVisible()
    await page.getByRole('link', { name: /^Atrium Cinema \d+ items/ }).click()
    await expect(page.getByRole('heading', { name: 'Atrium Cinema' })).toBeVisible()
    await expect(page.getByText('Desk: Mon–Sun 12:00–00:00')).toBeVisible()
    await expect(page.getByRole('link', { name: /Grey hoodie/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Brown leather wallet/ })).toHaveCount(0)
  })

  test('one-box search parses what and where; unknown place is flagged; removing a chip re-runs', async ({ page }) => {
    await page.getByRole('button', { name: 'Search for your item' }).click()
    await page.getByRole('searchbox', { name: 'Search for your item' }).fill('black bag in atrium mall')
    await page.keyboard.press('Enter')
    await expect(page.getByText('black bag', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove atrium mall' })).toBeVisible()
    const first = page.getByRole('main').getByRole('link').first()
    await expect(first).toHaveAccessibleName(/Black backpack/)

    await page.getByRole('searchbox').fill('AirPods at the food court')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: /White earbuds case/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'More info' })).toBeVisible() // dotted "not recognised" chip tooltip

    await page.getByRole('searchbox').fill('cat keychain')
    await page.keyboard.press('Enter')
    await expect(page.getByText('No match yet.')).toBeVisible() // D4: private details are never searchable

    await page.getByRole('searchbox').fill('umbrela in atrium')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: /Red umbrella/ })).toBeVisible()
    await page.getByRole('button', { name: 'Remove atrium' }).click()
    await expect(page).toHaveURL(/q=umbrela/)
  })

  test('claim chat asks only neutral follow-ups, never leaks, then submits', async ({ page }) => {
    await page.getByRole('button', { name: 'Search for your item' }).click()
    await page.getByRole('searchbox').fill('black backpack')
    await page.keyboard.press('Enter')
    await page.getByRole('link', { name: /Black backpack/ }).first().click()
    await expect(page.getByRole('heading', { name: 'Black backpack' })).toBeVisible()
    await expect(page.getByText('Food court, near gate 3')).toBeVisible()
    const body = await page.content()
    expect(body.toLowerCase()).not.toContain('cat keychain') // USR-ITEM-01 #4

    await page.getByRole('button', { name: 'This is mine' }).click()
    const sheet = page.getByRole('dialog', { name: 'Claim this item' })
    await expect(sheet.getByText('Tell us why this is yours.', { exact: false })).toBeVisible()
    await sheet.getByLabel('Your answer').fill('short')
    await expect(sheet.getByRole('button', { name: 'Send' })).toBeDisabled()
    await sheet.getByLabel('Your answer').fill('It is my black backpack with a blue Nike water bottle inside.')
    await sheet.getByRole('button', { name: 'Send' }).click()

    const followup = sheet.locator('div.bg-fill').filter({ hasText: '?' }).last()
    await expect(followup).toBeVisible()
    const q = (await followup.innerText()).toLowerCase()
    for (const w of SECRET_WORDS) expect(q).not.toContain(w)
    await expect(sheet.getByText(/more question|Last question/)).toBeVisible()

    await sheet.getByLabel('Your answer').fill('There is a little cat keychain on it')
    await sheet.getByRole('button', { name: 'Send' }).click()
    // Either one more neutral question or done; answer "I don't know" if asked.
    const idk = sheet.getByRole('button', { name: 'I don’t know' })
    const submitted = sheet.getByText('Request submitted')
    await expect(idk.or(submitted)).toBeVisible()
    if (await idk.isVisible()) await idk.click()
    await expect(submitted).toBeVisible()

    await sheet.getByRole('button', { name: 'See my requests' }).click()
    await expect(page).toHaveURL(/\/requests$/)
    await expect(page.getByRole('link', { name: /Black backpack/ })).toBeVisible()
    await expect(page.getByText(/Submitted|Under review/).first()).toBeVisible()
    // Scoring finishes in the background → Under review (the claimant never sees a score)
    await expect(page.getByText('Under review')).toBeVisible({ timeout: 15_000 })
    expect((await page.content()).toLowerCase()).not.toMatch(/\bscore\b|confidence/)

    await page.goto('/items/17e00000-0000-4000-8000-000000000001')
    await expect(page.getByRole('button', { name: 'View my request' })).toBeVisible()
  })

  test('moderation blocks abusive text', async ({ page }) => {
    await page.goto('/items/17e00000-0000-4000-8000-000000000005')
    await page.getByRole('button', { name: 'This is mine' }).click()
    const sheet = page.getByRole('dialog', { name: 'Claim this item' })
    await sheet.getByLabel('Your answer').fill('this is my shit umbrella give it back')
    await sheet.getByRole('button', { name: 'Send' }).click()
    await expect(sheet.getByText('Please keep it respectful.')).toBeVisible()
  })
})
