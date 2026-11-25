import { defineConfig } from 'astro/config'

// One base path feeds the pages, the manifest and the service worker.
export default defineConfig({
  site: 'https://tinesoft.github.io',
  base: '/watchdog',
  trailingSlash: 'always',
  output: 'static',
  devToolbar: { enabled: false },
})
