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
