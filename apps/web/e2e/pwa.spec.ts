import { expect, test } from '@playwright/test'

test('the manifest is installable and points inside the base path', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/watchdog/manifest.webmanifest')
  const m = await (await request.get(href!)).json()
  expect(m).toMatchObject({ display: 'standalone', start_url: './', scope: './' })
  const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
  for (const icon of m.icons) expect((await request.get(`/watchdog/${icon.src}`)).ok()).toBe(true)
})

test('after one visit the app reloads and works with no network', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.locator('.trow').first()).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  // Let the data fetch settle so its response is in the cache before the network goes.
  await page.reload()
  await expect(page.locator('.trow').first()).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.trow').first()).toBeVisible()
  await expect(page.locator('#wd-sweep')).toBeVisible()
  await page.getByRole('button', { name: /^Sources/ }).click()
  await expect(page.getByText('29 trusted sources')).toBeVisible()
  await context.setOffline(false)
})

test('the service worker never touches other origins', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  const src = await (await page.request.get('/watchdog/sw.js')).text()
  expect(src).toContain('url.origin !== self.location.origin')
  expect(src).not.toContain('osv.dev')
})
