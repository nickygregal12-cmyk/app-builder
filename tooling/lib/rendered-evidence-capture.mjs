import { INTERACTIONS } from './rendered-evidence.mjs';

/**
 * Drive a real browser over a running preview and return the bytes.
 *
 * Chromium is loaded lazily. The factory service must start, generate, verify
 * and preview on a machine with no browser installed; only capturing evidence
 * needs one, and that failure has to name itself rather than surface as a
 * missing module at import time.
 */
async function chromium() {
  try {
    const playwright = await import('@playwright/test');
    return playwright.chromium;
  } catch {
    throw new Error('Rendered evidence needs a browser. Install one with `npx playwright install chromium` and capture again.');
  }
}

/**
 * Where the browser lives.
 *
 * A managed download is the default, but a factory host often already has a
 * Chromium and no wish to fetch another. `APP_BUILDER_BROWSER_EXECUTABLE`
 * points at that one, which keeps evidence capture from depending on a
 * downloader reaching the network.
 */
function launchOptions(env) {
  const executablePath = env.APP_BUILDER_BROWSER_EXECUTABLE;
  return executablePath ? { executablePath } : {};
}

/** Reach the state, deterministically, or say the capture did not happen. */
async function perform(page, interaction) {
  if (interaction === 'enquiry-submit-failed') {
    const form = page.locator('form.enquiry-form');
    await form.waitFor({ state: 'visible', timeout: 5000 });
    await form.locator('input[name="name"]').fill('Evidence capture');
    await form.locator('input[name="email"]').fill('evidence@example.com');
    await form.locator('textarea[name="message"]').fill('Capturing how a failed submission reports itself.');
    await form.locator('button[type="submit"]').click();
    // The recipe writes the outcome into a live region; wait for the outcome
    // rather than for a fixed delay, so the picture is of the state and not of
    // whatever the page happened to look like after a sleep.
    await page.locator('.enquiry-actions p', { hasText: /could not send|Thanks/ }).waitFor({ timeout: 10_000 });
    return;
  }
  throw new Error(`Unknown evidence interaction: ${interaction}`);
}

export async function captureEvidence({ plan, baseUrl, launch = null, onCapture = null, env = process.env } = {}) {
  if (!plan?.captures?.length) return { results: [], failures: [] };
  const browser = await (launch ? launch() : (await chromium()).launch(launchOptions(env)));
  const results = [];
  const failures = [];
  try {
    for (const capture of plan.captures) {
      const viewport = plan.viewports.find((entry) => entry.name === capture.viewport);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        // Reduced motion keeps a capture reproducible; an animation mid-flight
        // renders differently every run and turns evidence into noise.
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      try {
        await page.goto(new URL(capture.route, baseUrl).toString(), { waitUntil: 'networkidle', timeout: 20_000 });
        await page.locator('main').waitFor({ timeout: 10_000 });
        if (capture.state.interaction) {
          if (!INTERACTIONS[capture.state.interaction]) throw new Error(`Unknown evidence interaction: ${capture.state.interaction}`);
          await perform(page, capture.state.interaction);
        }
        const bytes = await page.screenshot({ fullPage: true, animations: 'disabled', type: 'png' });
        results.push({ id: capture.id, bytes });
        if (onCapture) onCapture(capture);
      } catch (error) {
        failures.push({ id: capture.id, message: error instanceof Error ? error.message : String(error) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return { results, failures };
}
