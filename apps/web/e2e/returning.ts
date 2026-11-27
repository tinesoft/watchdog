import type { Page } from '@playwright/test'

/**
 * A returning user who has not cleared the Inbox yet: every Threat not in `seen` is new.
 * Applied once per tab, so a later reload keeps what the test saved.
 */
export async function returningUser(page: Page, seen: string[] = []): Promise<void> {
  await page.addInitScript(seen => {
    if (sessionStorage.getItem('wd-returning')) return
    sessionStorage.setItem('wd-returning', '1')
    localStorage.setItem('watchdog:v1', JSON.stringify({ seen }))
  }, seen)
}
