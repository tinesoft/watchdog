import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('the sidebar is a drawer behind the hamburger on a phone', async ({ page }) => {
  await page.goto('./')
  const side = page.locator('#wd-side')
  const toggle = page.getByRole('button', { name: 'Open navigation' })
  await toggle.click()
  await expect(page.getByRole('button', { name: 'Close navigation' }).first()).toBeVisible()
  await expect(side.getByRole('button', { name: 'Settings' })).toBeVisible()
  await side.getByRole('button', { name: /^All threats/ }).click()
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
})

test('picking a threat scrolls down to its details', async ({ page }) => {
  await page.goto('./')
  await page.locator('.trow').first().click()
  const details = page.getByRole('complementary', { name: 'Threat details' })
  await expect(details).toBeInViewport({ ratio: 0.3 })
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(200)
})

test('the page never scrolls sideways on a phone', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.trow').first()).toBeVisible()
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(await overflow()).toBe(0)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  expect(await overflow()).toBe(0)
})

test('a Threat row fits a phone: the ID on one line, a readable title, and all three tags', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'watchdog:v1',
      JSON.stringify({ seen: [], stack: ['log4j'], triage: { 'CVE-2021-44228': 'investigating' } }),
    ),
  )
  await page.goto('./')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page
    .locator('#wd-side')
    .getByRole('button', { name: /^All threats/ })
    .click()
  const row = page.locator('.trow', { hasText: 'CVE-2021-44228' })
  await expect(row.locator('.kev')).toBeVisible()
  await expect(row.getByText('◆ my stack')).toBeVisible()
  await expect(row.getByText('Investigating')).toBeVisible()
  const box = await row.evaluate(r => {
    const rect = (s: string) => r.querySelector(s)!.getBoundingClientRect()
    const tags = [...r.querySelectorAll('.trow-tags > *')].map(t => t.getBoundingClientRect())
    const outer = r.getBoundingClientRect()
    return {
      idHeight: rect('.trow-main > .mono').height,
      titleWidth: rect('.trow-title').width,
      tagsInside: tags.every(t => t.right <= outer.right && t.left >= outer.left),
    }
  })
  expect(box.idHeight).toBeLessThan(24)
  // About 25 characters a line, on up to two lines.
  expect(box.titleWidth).toBeGreaterThan(180)
  expect(box.tagsInside).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
})
