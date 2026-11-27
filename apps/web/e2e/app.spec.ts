import { expect, test } from '@playwright/test'
import { returningUser } from './returning'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
})

test('a first visit starts the Inbox with only the Exploited Threats, riskiest first', async ({
  page,
}) => {
  const first = page.locator('.trow').first()
  await expect(first).toContainText('CVE-2021-44228')
  await expect(page.getByRole('button', { name: /^Inbox, 4/ })).toBeVisible()
  await expect(page.locator('.trow')).toHaveCount(4)
  await expect(page.locator('.trow .kev')).toHaveCount(4)
})

test('a returning user sees every new Threat in the Inbox, riskiest first', async ({ page }) => {
  await returningUser(page)
  await page.reload()
  await expect(page.locator('.trow').first()).toContainText('CVE-2021-44228')
  await expect(page.getByRole('button', { name: /^Inbox, 13/ })).toBeVisible()
})

test('triage status and notes persist across a reload, and leave the inbox', async ({ page }) => {
  await returningUser(page)
  await page.reload()
  await page.locator('.trow', { hasText: 'CVE-2024-3094' }).click()
  await page.getByRole('button', { name: 'Patched' }).click()
  await page.locator('#wd-note').fill('rolled back to 5.4.6')
  await page.reload()
  await page.getByRole('button', { name: /^Triage/ }).click()
  await page.locator('.trow', { hasText: 'CVE-2024-3094' }).click()
  await expect(page.locator('#wd-note')).toHaveValue('rolled back to 5.4.6')
  await expect(page.getByRole('button', { name: 'Inbox, 12' })).toBeVisible()
})

test('adding to the stack marks threats as mine and wakes the dog', async ({ page }) => {
  await page.getByRole('button', { name: /^Edit my stack: no stack yet/ }).click()
  await page.getByRole('button', { name: /Log4j/ }).click()
  await page.getByRole('button', { name: /^My stack, 1/ }).click()
  await expect(page.locator('.trow')).toHaveCount(1)
  await expect(page.locator('.trow')).toContainText('Log4Shell')
  await expect(page.locator('.side-card')).toContainText('woof! 1 exploited')
})

test('theme toggle switches and persists', async ({ page }) => {
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('.wd-light')).toBeVisible()
  await page.reload()
  await expect(page.locator('.wd-light')).toBeVisible()
})

test('sources and field reports pages render', async ({ page }) => {
  await page.getByRole('button', { name: /^Sources/ }).click()
  await expect(page.getByText('29 trusted sources')).toBeVisible()
  await page.getByRole('button', { name: 'Field reports' }).click()
  await expect(page.getByText('sample reports')).toBeVisible()
  await page.getByRole('button', { name: /^Sophos/ }).click()
  await expect(page.locator('.repcard')).toHaveCount(1)
})

test('search narrows the list and the exploited filter works', async ({ page }) => {
  await page.getByRole('button', { name: /^All threats/ }).click()
  await page.getByRole('button', { name: 'Exploited only' }).click()
  await expect(page.locator('.trow')).toHaveCount(4)
  await page.locator('#wd-q').fill('php')
  await expect(page.locator('.trow')).toHaveCount(1)
})

test('search waits for a pause in typing, but Enter, clearing and clicks apply at once', async ({
  page,
}) => {
  await page.clock.install()
  await page.reload()
  await page.clock.pauseAt(Date.now() + 1000)
  await page.getByRole('button', { name: /^All threats/ }).click()
  const rows = page.locator('.trow')
  const all = await rows.count()
  const q = page.locator('#wd-q')

  await q.fill('php')
  await expect(rows).toHaveCount(all)
  await page.clock.runFor(150)
  await expect(rows).toHaveCount(1)

  await q.fill('')
  await expect(rows).toHaveCount(all)

  await q.fill('php')
  await q.press('Enter')
  await expect(rows).toHaveCount(1)

  await q.fill('')
  await q.fill('php')
  await page.getByRole('button', { name: 'Exploited only' }).click()
  await expect(rows).toHaveCount(1)
  await expect(q).toHaveValue('php')
})

test('the tab icon turns to the alarm colour while the dog barks, and back', async ({ page }) => {
  const icon = () => page.locator('#wd-favicon').getAttribute('href')
  expect(await icon()).toBe('/watchdog/favicon.svg')
  await page.getByRole('button', { name: /^Edit my stack: no stack yet/ }).click()
  await page.getByRole('button', { name: /Log4j/ }).click()
  const alarm = decodeURIComponent((await icon())!)
  expect(alarm).toContain('#FF5A4E')
  expect(alarm).toContain('<circle cx="25.5" cy="6.5"')
  expect(alarm).not.toContain('<text')
  await page.getByRole('button', { name: /^Edit my stack/ }).click()
  await page.getByRole('button', { name: /Log4j/ }).click()
  expect(await icon()).toBe('/watchdog/favicon.svg')
})
