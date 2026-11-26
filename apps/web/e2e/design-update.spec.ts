import { expect, test } from '@playwright/test'

test('the Supply chain attack tab filters to the xz backdoor', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^All threats/ }).click()
  await page.getByRole('button', { name: /^Supply chain attack/ }).click()
  await expect(page.locator('.trow')).toHaveCount(1)
  await expect(page.locator('.trow')).toContainText('CVE-2024-3094')
})

test('the legend stays pinned to the bottom while the list scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 })
  await page.goto('./')
  await page.getByRole('button', { name: /^All threats/ }).click()
  const legend = page.getByRole('region', { name: 'What the icons mean' })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.wheel(0, 3000)
  await expect(legend).toBeInViewport({ ratio: 1 })
})

test('the collapsed sidebar dog looks around while calm', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  const head = page.locator('.side-mini.calm .bark-head')
  await expect(head).toBeVisible()
  const name = await head.evaluate(el => getComputedStyle(el).animationName)
  expect(name).toBe('lookaround')
  await expect(page.locator('.side-mini .bark-eye')).toHaveCount(1)
})

test('the sources groups have plural names', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Sources/ }).click()
  for (const n of ['Governments / CERTs', 'Vendors', 'Advisory databases', 'Security vendors']) {
    await expect(page.getByRole('region', { name: n, exact: true })).toBeVisible()
  }
})

test('settings link the repository and the release notes', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Settings' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('link', { name: /watchdog on/ })).toHaveAttribute(
    'href',
    'https://github.com/tinesoft/watchdog',
  )
  const notes = dialog.getByRole('link', { name: /^v\d/ })
  await expect(notes).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/tinesoft\/watchdog\/releases\/tag\/v\d+\.\d+\.\d+/,
  )
})

test('the next-sweep countdown ticks down by itself', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-03-10T08:00:00Z') })
  await page.route('**/data/threats.json', route =>
    route.fulfill({
      json: { sample: false, collectedAt: '2026-03-10T07:05:00Z', items: [] },
    }),
  )
  await page.goto('./')
  const pill = page.locator('#wd-sweep')
  await expect(pill).toHaveText('swept 55 min ago · next in 6h00')
  await page.clock.fastForward('30:00')
  await expect(pill).toHaveText('swept 1 h ago · next in 5h30')
})

test('issue labels are chips: Enter and comma add, Backspace and × remove', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Settings' }).click()
  const field = page.getByLabel('Labels added to new issues')
  const chips = page.locator('.lchip')
  await expect(chips).toHaveText(['security'])
  await field.fill('vulnerability')
  await field.press('Enter')
  await field.pressSequentially('triage,')
  await expect(chips).toHaveText(['security', 'vulnerability', 'triage'])
  await expect(field).toHaveValue('')
  await expect(field).toBeFocused()
  await field.press('Backspace')
  await page.getByRole('button', { name: 'Remove label security' }).click()
  await expect(chips).toHaveText(['vulnerability'])
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('watchdog:v1')!).labels)
  expect(saved).toBe('vulnerability')
})

test('on a large screen only the page body scrolls; the frame stays in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 480 })
  await page.goto('./')
  await page.getByRole('button', { name: /^All threats/ }).click()
  const body = page.locator('.pane-scroll')
  await expect(page.locator('.detail-empty')).toBeVisible()
  await body.hover()
  await page.mouse.wheel(0, 3000)
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(480)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  for (const el of [
    page.locator('.topbar'),
    page.locator('#wd-side'),
    page.getByRole('heading', { level: 1 }),
    page.getByRole('button', { name: /^Exploited only/ }),
    page.getByRole('region', { name: 'What the icons mean' }),
  ])
    await expect(el).toBeInViewport({ ratio: 1 })
  // Picking a row keeps the list where it was and fills the details column.
  const before = await body.evaluate(el => el.scrollTop)
  await page.locator('.trow').last().click()
  await expect(page.locator('.detail-pane.panel-in')).toBeVisible()
  expect(await body.evaluate(el => el.scrollTop)).toBe(before)
  const pane = page.locator('.detail-pane')
  expect(await pane.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto')
})
