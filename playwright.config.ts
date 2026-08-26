import { defineConfig, devices } from '@playwright/test';

// A host that already has a Chromium should not have to fetch another, and a
// pinned Playwright wanting a build the machine does not carry should not stop
// the suite running locally. `APP_BUILDER_BROWSER_EXECUTABLE` is the same
// variable rendered-evidence capture already reads. Unset — as in CI, which
// installs its own — this is undefined and nothing changes.
const launchOptions = { executablePath: process.env.APP_BUILDER_BROWSER_EXECUTABLE };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tooling/dev-stack.mjs --e2e',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
