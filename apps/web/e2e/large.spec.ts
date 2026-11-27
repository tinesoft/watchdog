import { expect, test, type Page } from '@playwright/test'
import { NO_PRODUCT } from '../src/lib/types'
import { largeDataset, largeThreats } from './large'
import { returningUser } from './returning'

const items = largeThreats()
const fmt = (n: number) => n.toLocaleString('en-US')

async function serveLarge(page: Page) {
  await page.route('**/data/threats.json', route => route.fulfill({ json: largeDataset(items) }))
}

const allThreats = (page: Page) => page.getByRole('button', { name: /^All threats/ }).click()

test.beforeEach(async ({ page }) => serveLarge(page))

test('a list draws 100 rows, Show more adds 100, and a new query starts over', async ({ page }) => {
  await page.goto('./')
  await allThreats(page)
  const rows = page.locator('.trow')
  await expect(rows).toHaveCount(100)
  await expect(page.getByText(`Showing 100 of ${fmt(items.length)}`)).toBeVisible()
  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(rows).toHaveCount(200)
  await expect(page.getByRole('button', { name: 'Show more' })).toBeFocused()

  await page.locator('#wd-q').fill('linux')
  await expect(rows).toHaveCount(100)
  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(rows).toHaveCount(200)
  await page.getByRole('button', { name: 'Exploited only' }).click()
  const hits = items.filter(t => t.exploited && t.title.toLowerCase().includes('linux')).length
  await expect(rows).toHaveCount(Math.min(100, hits))
})

test('a first visit starts the Inbox with only the Exploited Threats', async ({ page }) => {
  await page.goto('./')
  const n = items.filter(t => t.exploited).length
  await expect(page.getByRole('button', { name: new RegExp(`^Inbox, ${n}\\b`) })).toBeVisible()
})

test('a new Threat that is not Exploited, not Mine and names no product stays out of the Inbox', async ({
  page,
}) => {
  await returningUser(page)
  await page.goto('./')
  const inInbox = items.filter(t => t.exploited || t.product !== NO_PRODUCT).length
  await expect(
    page.getByRole('button', { name: new RegExp(`^Inbox, ${inInbox}\\b`) }),
  ).toBeVisible()
  const quiet = items.find(t => !t.exploited && t.product === NO_PRODUCT)!
  await allThreats(page)
  await page.locator('#wd-q').fill(quiet.id)
  await page.locator('#wd-q').press('Enter')
  await expect(page.locator('.trow')).toHaveCount(1)
  await expect(page.locator('.trow')).toContainText(quiet.id)
  await expect(page.locator('.trow .newtag')).toHaveCount(0)
})

test('Mark all as read keeps only the IDs in the current data', async ({ page }) => {
  await returningUser(page, ['CVE-1999-0001'])
  await page.goto('./')
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  await expect(page.getByRole('button', { name: /^Inbox$|^Inbox, 0\b/ })).toBeVisible()
  const seen = await page.evaluate(
    () => (JSON.parse(localStorage.getItem('watchdog:v1')!) as { seen: string[] }).seen,
  )
  expect(seen).toHaveLength(items.length)
  expect(seen).not.toContain('CVE-1999-0001')
  await page.getByRole('button', { name: 'See all threats' }).click()
  await expect(page.getByRole('heading', { name: 'All threats' })).toBeVisible()
})
