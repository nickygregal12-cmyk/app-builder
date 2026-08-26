import { defineConfig, devices } from '@playwright/test';
import { generatedPreviewEnv } from './tooling/lib/generated-preview.mjs';

// A host that already has a Chromium should not have to fetch another, and a
// pinned Playwright wanting a build the machine does not carry should not stop
// the suite running locally. `APP_BUILDER_BROWSER_EXECUTABLE` is the same
// variable rendered-evidence capture already reads. It names a Chromium, so it
// is applied only to the Chromium project — pointing WebKit at a Chrome binary
// would silently turn the portability lane back into one engine, which is the
// exact failure this lane exists to prevent.
const chromiumExecutable = process.env.APP_BUILDER_BROWSER_EXECUTABLE;

// The generated project under test states what its own dev server needs in
// order to be a supervised child process rather than a daemon that outlives the
// run. Reading it from the build is the same thing the factory service does,
// so this config never has to know which framework it is starting.
const GENERATED = '.tmp/generated-acceptance-marketing-site';

export default defineConfig({
  testDir: './tests/portability',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4473',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Three engines and one mobile composition, deliberately not the full matrix.
  // Chromium is the primary browser and keeps full RenderedEvidence elsewhere;
  // these four exist to catch what only a different engine can show.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: chromiumExecutable } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `npm --prefix ${GENERATED} run dev -- --host 127.0.0.1 --port 4473`,
    env: generatedPreviewEnv(GENERATED),
    url: 'http://127.0.0.1:4473',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
