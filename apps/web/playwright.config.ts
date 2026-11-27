import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4321/watchdog/', colorScheme: 'dark' },
  projects: [
    { name: 'app', testIgnore: /perf\.spec\.ts/ },
    // Timing: alone, once the rest has finished.
    { name: 'perf', testMatch: /perf\.spec\.ts/, dependencies: ['app'] },
  ],
  webServer: {
    command:
      'node scripts/seed.ts && ../../node_modules/.bin/astro build && node scripts/build-sw.ts && exec ../../node_modules/.bin/astro preview --port 4321 --ignore-lock',
    url: 'http://localhost:4321/watchdog/',
    // Never reuse a running server: a leftover one serves a stale build and tests pass or fail on old code.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
