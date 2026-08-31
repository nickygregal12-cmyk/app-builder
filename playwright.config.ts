import { defineConfig, devices } from '@playwright/test';
import { lanePort, laneServer, laneUrl } from './tooling/lib/e2e-server.mjs';

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
    baseURL: laneUrl('console-e2e'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The Console and the factory behind it both move with the checkout, so two
  // worktrees running this suite at once test their own stack rather than
  // whichever one started first. `dev-stack` already refuses an occupied port
  // and checks its own instance token before reporting ready; it just never got
  // the chance while Playwright was reusing whatever answered.
  webServer: laneServer({
    lane: 'console-e2e',
    command: `node tooling/dev-stack.mjs --e2e --console-port ${lanePort('console-e2e')} --service-port ${lanePort('console-e2e-service')}`,
  }),
});
