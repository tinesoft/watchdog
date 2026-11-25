/** Writes dist/sw.js: the template with this build's file list and a version hashed from its contents. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { BASE as SITE_BASE } from '../site.config.mjs'

const dist = new URL('../dist/', import.meta.url).pathname
const BASE = `${SITE_BASE}/`

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(n =>
    statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)],
  )

// Data and the feed change with every Sweep: they are fetched network-first, not precached.
const skip = (rel: string) => rel === 'sw.js' || rel.startsWith('data/') || rel === 'feed.xml'
const files = walk(dist)
  .map(f => relative(dist, f).split('\\').join('/'))
  .filter(f => !skip(f))
  .sort()

const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
const hash = createHash('sha256').update(template)
for (const f of files) hash.update(f).update(readFileSync(join(dist, f)))
const version = hash.digest('hex').slice(0, 12)

const urls = [BASE, ...files.map(f => BASE + f)]
const sw = template
  .replace('__VERSION__', version)
  .replace('__BASE__', BASE)
  .replace('/*PRECACHE*/ []', JSON.stringify(urls, null, 2))
writeFileSync(join(dist, 'sw.js'), sw)
console.log(`[sw] ${urls.length} files precached, version ${version}`)
