import { defineConfig, devices } from '@playwright/test';
import { generatedPreviewEnv } from './tooling/lib/generated-preview.mjs';

// A host that already has a Chromium should not have to fetch another, and a
// pinned Playwright wanting a build the machine does not carry should not stop
// the suite running locally. `APP_BUILDER_BROWSER_EXECUTABLE` is the same
// variable rendered-evidence capture already reads. Unset — as in CI, which
// installs its own — this is undefined and nothing changes.
const launchOptions = { executablePath: process.env.APP_BUILDER_BROWSER_EXECUTABLE };

// The generated project under test states what its own dev server needs in
// order to be a supervised child process rather than a daemon that outlives the
// run. Reading it from the build is the same thing the factory service does,
// so this config never has to know which framework it is starting.
const GENERATED = '.tmp/real-business-acceptance/workspaces/acme-retrofit';

export default defineConfig({
  testDir: './tests/real-business',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4273',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm --prefix ${GENERATED} run dev -- --host 127.0.0.1 --port 4273`,
    env: generatedPreviewEnv(GENERATED),
    url: 'http://127.0.0.1:4273',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
