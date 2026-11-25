import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4321/watchdog/', colorScheme: 'dark' },
  webServer: {
    command:
      'node scripts/seed.ts && ../../node_modules/.bin/astro build && node scripts/build-sw.ts && ../../node_modules/.bin/astro preview --port 4321',
    url: 'http://localhost:4321/watchdog/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
