/** Puts the seed fixtures in public/data when no Sweep has written real data there yet. */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

const root = new URL('../', import.meta.url)
mkdirSync(new URL('public/data/', root), { recursive: true })
for (const name of ['threats', 'reports']) {
  const out = new URL(`public/data/${name}.json`, root)
  if (!existsSync(out)) copyFileSync(new URL(`data/seed/${name}.json`, root), out)
}
