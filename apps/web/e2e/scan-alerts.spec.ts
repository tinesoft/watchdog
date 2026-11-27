import { expect, test } from '@playwright/test'
import { returningUser } from './returning'

const SAMPLE = JSON.stringify({
  dependencies: {
    next: '14.1.0',
    'follow-redirects': '1.15.5',
    '@modelcontextprotocol/inspector': '0.13.0',
    'left-pad': '1.3.0',
  },
})

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  await page.getByRole('button', { name: 'Scan dependencies' }).click()
})

test('scan finds the design example and offers upgrade commands', async ({ page }) => {
  await page.locator('#wd-scan-text').fill(SAMPLE)
  await page.getByRole('button', { name: 'Sniff it' }).click()
  await expect(page.getByText('4 deps scanned')).toBeVisible()
  await expect(page.getByText('3 vulnerable')).toBeVisible()
  await expect(page.getByText('2 critical')).toBeVisible()
  await expect(page.getByText('npm install next@15.2.3')).toBeVisible()
})

test('scan reads a dropped or chosen file by name', async ({ page }) => {
  await page.locator('#wd-scan-file').setInputFiles({
    name: 'requirements.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('left-pad==1.0.0\n'),
  })
  await page.getByRole('button', { name: 'Sniff it' }).click()
  await expect(page.getByText('1 deps scanned')).toBeVisible()
  await expect(page.getByText('Clean.')).toBeVisible()
})

test('OSV is off by default and sends only package data when ticked', async ({ page }) => {
  let body = ''
  let calls = 0
  await page.route('https://api.osv.dev/**', route => {
    calls++
    body = route.request().postData() ?? ''
    return route.fulfill({ json: { results: [{ vulns: [{ id: 'GHSA-xxxx-yyyy' }] }] } })
  })
  await page.locator('#wd-scan-text').fill('{"dependencies":{"left-pad":"1.3.0"}}')
  await page.getByRole('button', { name: 'Sniff it' }).click()
  await expect(page.getByText('Clean.')).toBeVisible()
  expect(calls).toBe(0)
  await page.getByLabel('Check with OSV.dev').check()
  await page.getByRole('button', { name: 'Sniff it' }).click()
  await expect(page.getByText('GHSA-xxxx-yyyy')).toBeVisible()
  expect(JSON.parse(body)).toEqual({
    queries: [{ package: { name: 'left-pad', ecosystem: 'npm' }, version: '1.3.0' }],
  })
})

test('a failing OSV call falls back to the local result', async ({ page }) => {
  await page.route('https://api.osv.dev/**', route => route.abort())
  await page.locator('#wd-scan-text').fill(SAMPLE)
  await page.getByLabel('Check with OSV.dev').check()
  await page.getByRole('button', { name: 'Sniff it' }).click()
  await expect(page.getByText('OSV.dev could not be reached')).toBeVisible()
  await expect(page.getByText('3 vulnerable')).toBeVisible()
})

test('browser alerts notify once per new threat in the stack', async ({ page, context }) => {
  await context.grantPermissions(['notifications'])
  await page.addInitScript(() => {
    const calls: string[] = []
    ;(window as unknown as { __notes: string[] }).__notes = calls
    class FakeNotification {
      static permission = 'granted'
      static requestPermission = async () => 'granted'
      onclick: (() => void) | null = null
      constructor(title: string, opts?: { body?: string }) {
        calls.push(`${title} | ${opts?.body ?? ''}`)
      }
    }
    ;(window as unknown as { Notification: unknown }).Notification = FakeNotification
  })
  await returningUser(page)
  await page.goto('./')
  await page.getByRole('button', { name: /^Edit my stack/ }).click()
  await page.getByRole('button', { name: /Log4j/ }).click()
  await page.getByRole('button', { name: 'Alerts' }).click()
  await page.getByRole('switch', { name: /Browser alerts/ }).click()
  const notes = () => page.evaluate(() => (window as unknown as { __notes: string[] }).__notes)
  await expect.poll(notes).toHaveLength(1)
  expect((await notes())[0]).toContain('1 new threat in your stack')
  expect((await notes())[0]).toContain('CVE-2021-44228')
  await page.getByRole('button', { name: 'Close alerts' }).click()
  await page.getByRole('button', { name: /^Edit my stack/ }).click()
  await page.getByRole('button', { name: /Next.js/ }).click()
  await page.getByRole('button', { name: 'Alerts' }).click()
  await page.getByRole('button', { name: 'Anything in my stack' }).click()
  await expect.poll(notes).toHaveLength(2)
  expect((await notes())[1]).toContain('CVE-2025-29927')
  expect((await notes())[1]).not.toContain('CVE-2021-44228')
})
