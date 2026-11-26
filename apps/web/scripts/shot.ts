/**
 * Builds the app, serves it, screenshots one state, and always stops the server.
 *
 *   node scripts/shot.ts [options] <out.png>
 *
 *   --width <px>      viewport width (default 1440; 390 for mobile)
 *   --height <px>     viewport height (default 900)
 *   --click <name>    click the button whose accessible name starts with <name>; repeatable, in order
 *   --wheel <px>      scroll the mouse wheel by <px> over the middle of the viewport, after the clicks
 *   --wait <ms>       pause before the shot, for entry animations (default 800)
 *   --full            capture the whole page, not just the viewport
 *   --no-build        serve the existing dist/ instead of building first
 *   --root <dir>      the app folder to build and serve (default: this app); see docs/agents/design.md
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'

const here = fileURLToPath(new URL('../', import.meta.url))
const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: 'string', default: '1440' },
    height: { type: 'string', default: '900' },
    click: { type: 'string', multiple: true, default: [] },
    wheel: { type: 'string' },
    wait: { type: 'string', default: '800' },
    full: { type: 'boolean', default: false },
    'no-build': { type: 'boolean', default: false },
    root: { type: 'string', default: here },
  },
})
const out = positionals[0]
if (!out) {
  console.error('usage: node scripts/shot.ts [options] <out.png>')
  process.exit(2)
}
const root = resolve(o.root)
// The astro binary comes from this checkout, so a worktree without its own install still builds.
const astro = resolve(here, '../../node_modules/.bin/astro')

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`)
}
if (!o['no-build']) {
  run(process.execPath, ['scripts/seed.ts'])
  run(astro, ['build'])
  run(process.execPath, ['scripts/build-sw.ts'])
}

const port = await new Promise<number>(done => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const p = (s.address() as { port: number }).port
    s.close(() => done(p))
  })
})
const { BASE } = (await import(resolve(root, 'site.config.mjs'))) as { BASE: string }
// Pinned to IPv4: preview listens on ::1 for "localhost", which Node's fetch does not try.
const url = `http://127.0.0.1:${port}${BASE.endsWith('/') ? BASE : BASE + '/'}`

const server = spawn(
  astro,
  ['preview', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'],
  {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  },
)
const stop = () => server.kill()
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

try {
  for (let i = 0; ; i++) {
    if (i > 100) throw new Error(`preview did not answer at ${url}`)
    if (
      await fetch(url).then(
        r => r.ok,
        () => false,
      )
    )
      break
    await new Promise(r => setTimeout(r, 200))
  }
  const browser = await chromium.launch()
  try {
    const width = Number(o.width)
    const height = Number(o.height)
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'dark' })
    await page.goto(url)
    for (const name of o.click) {
      const re = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      await page.getByRole('button', { name: re }).first().click()
    }
    if (o.wheel) {
      await page.mouse.move(width / 2, height / 2)
      await page.mouse.wheel(0, Number(o.wheel))
    }
    await page.waitForTimeout(Number(o.wait))
    await page.screenshot({ path: resolve(out), fullPage: o.full })
    console.log(resolve(out))
  } finally {
    await browser.close()
  }
} finally {
  stop()
}
