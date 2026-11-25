import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
})

test('inbox lists the riskiest threat first and counts match the nav', async ({ page }) => {
  const first = page.locator('.trow').first()
  await expect(first).toContainText('CVE-2021-44228')
  await expect(page.getByRole('button', { name: /^Inbox, 13/ })).toBeVisible()
})

test('triage status and notes persist across a reload, and leave the inbox', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Edit my stack, 0' }).click()
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

test('the tab icon turns to the alarm colour while the dog barks, and back', async ({ page }) => {
  const icon = () => page.locator('#wd-favicon').getAttribute('href')
  expect(await icon()).toBe('/watchdog/favicon.svg')
  await page.getByRole('button', { name: 'Edit my stack, 0' }).click()
  await page.getByRole('button', { name: /Log4j/ }).click()
  const alarm = decodeURIComponent((await icon())!)
  expect(alarm).toContain('#FF5A4E')
  expect(alarm).toContain('<circle cx="25.5" cy="6.5"')
  expect(alarm).not.toContain('<text')
  await page.getByRole('button', { name: /^Edit my stack/ }).click()
  await page.getByRole('button', { name: /Log4j/ }).click()
  expect(await icon()).toBe('/watchdog/favicon.svg')
})
