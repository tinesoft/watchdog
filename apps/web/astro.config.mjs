import { defineConfig } from 'astro/config'
import { BASE } from './site.config.mjs'

// One base path feeds the pages, the manifest and the service worker.
export default defineConfig({
  site: 'https://tinesoft.github.io',
  base: BASE,
  trailingSlash: 'always',
  output: 'static',
  devToolbar: { enabled: false },
})
