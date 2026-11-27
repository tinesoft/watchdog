import { expect, test } from '@playwright/test'
import { largeDataset } from './large'

// Runs as its own Playwright project, after every other test, so parallel workers don't skew the timing.
test.beforeEach(async ({ page }) => {
  await page.route('**/data/threats.json', route => route.fulfill({ json: largeDataset() }))
})

test('typing stays fast with 2,500 Threats on a 4× slower CPU', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling needs the Chrome DevTools Protocol')
  await page.goto('./')
  await page.getByRole('button', { name: /^All threats/ }).click()
  await expect(page.locator('.trow')).toHaveCount(100)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const times = await page.evaluate(async () => {
    // Each render rebuilds the page, so look the field up again every time.
    const field = () => document.getElementById('wd-q') as HTMLInputElement
    const handler: number[] = []
    const render: number[] = []
    for (const word of ['l', 'li', 'lin', 'linu', 'linux', 'linu', 'lin', 'ope', 'open']) {
      let t = performance.now()
      field().value = word
      field().dispatchEvent(new Event('input', { bubbles: true }))
      handler.push(performance.now() - t)
      t = performance.now()
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      void document.body.offsetHeight // include style and layout of the new list
      render.push(performance.now() - t)
      await new Promise(r => setTimeout(r, 20))
    }
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
    return { handler: median(handler), render: median(render) }
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  console.log(
    `median input handler ${times.handler.toFixed(1)} ms, render ${times.render.toFixed(1)} ms (4× CPU)`,
  )
  expect(times.handler).toBeLessThan(16)
  expect(times.render).toBeLessThan(50)
})
