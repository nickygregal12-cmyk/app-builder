import { INTERACTIONS } from './rendered-evidence.mjs';
import { describeEvidenceBrowser, evidenceBrowserStatus } from './evidence-browser.mjs';

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
    const { outcome } = INTERACTIONS[interaction];
    const form = page.locator('form.enquiry-form');
    await form.waitFor({ state: 'visible', timeout: 5000 });
    // Cause the failure rather than hoping for one.
    if (outcome.failRequest) await page.route(outcome.failRequest, (route) => route.abort());
    await form.locator('input[name="name"]').fill('Evidence capture');
    await form.locator('input[name="email"]').fill('evidence@example.com');
    await form.locator('textarea[name="message"]').fill('Capturing how a failed submission reports itself.');
    await form.locator('button[type="submit"]').click();
    // The recipe writes the outcome into a live region; wait for the outcome
    // rather than for a fixed delay, so the picture is of the state and not of
    // whatever the page happened to look like after a sleep.
    const region = page.locator(outcome.selector, { hasText: outcome.settled });
    await region.waitFor({ timeout: 10_000 });
    // Settling is not arriving. If the submission succeeded, this capture never
    // reached the state it claims, and publishing the picture anyway would make
    // the evidence set assert something it did not see.
    const text = (await region.first().innerText()).trim();
    if (!outcome.reached.test(text)) {
      throw new Error(`Interaction ${interaction} did not reach its state: the form reported ${JSON.stringify(text)}.`);
    }
    return;
  }
  if (interaction === 'navigation-disclosed') {
    const { outcome } = INTERACTIONS[interaction];
    const control = page.locator(outcome.control);
    // The control is `hidden` until the disclosure script runs, so waiting for
    // it is also how this waits for the behaviour to be live rather than for a
    // fixed delay.
    await control.waitFor({ state: 'visible', timeout: 5000 });
    await control.click();
    const panel = page.locator(outcome.panel);
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    // Opened, not merely clicked. A picture of a panel that stayed shut would
    // assert a state the capture never reached.
    const open = await panel.getAttribute('data-open');
    if (open !== outcome.reached) {
      throw new Error(`Interaction ${interaction} did not reach its state: the panel reported data-open=${JSON.stringify(open)}.`);
    }
    return;
  }
  throw new Error(`Unknown evidence interaction: ${interaction}`);
}

// The preview serves under a base path, so a route is resolved *inside* that
// base. `new URL('/services', base)` would drop it and address the host root.
export function evidenceUrl(route, baseUrl) {
  const base = String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
  return new URL(String(route).replace(/^\/+/, ''), base).toString();
}

/**
 * Make a full-page capture show the pictures the page actually has.
 *
 * Every image the template renders is `loading="lazy"`, which is right for a
 * visitor and wrong for a full-page screenshot: the browser never scrolls, so
 * an image below the fold is never fetched, and the capture publishes a
 * blank rectangle where a photograph is. Evidence that omits the photography is
 * worse than no evidence, because a reviewer reads it as a build with no
 * pictures rather than as a capture that did not wait.
 *
 * Scroll to the end, ask for anything still deferred, then wait for each image
 * to report itself complete before returning to the top. Bounded: an image that
 * never loads leaves the page as it is rather than hanging the capture.
 */
async function settleLazyImages(page) {
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight, 480);
    for (let offset = 0; offset < document.body.scrollHeight; offset += step) {
      window.scrollTo(0, offset);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = 'eager';
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete), null, { timeout: 10_000 }).catch(() => {});
}

/**
 * Prove the page that rendered is the page that was asked for.
 *
 * The first independent visual review was handed eighteen captures of what were
 * really three pages. Every request was correct — the URL was right and
 * `location.pathname` really was `/services` — and every response was a 200 with
 * a screenshot, so nothing downstream had any reason to doubt it. The server was
 * answering each prerendered route with the home document, and "HTTP 200 and a
 * picture exists" was the whole test.
 *
 * So the capture asserts identity before the screenshot becomes evidence. It
 * does not invent a second route truth: `data-page-id` is the identity the
 * template already renders and the Console already reads, and the expected value
 * is the PageSpec id the plan was derived from. A capture that cannot establish
 * which page it is looking at fails rather than publishing an unattributed
 * picture.
 */
async function assertRenderedIdentity(page, capture) {
  const rendered = await page.locator('main').getAttribute('data-page-id');
  if (rendered === capture.pageId) return;
  throw new Error(
    `Capture ${capture.id} asked for ${capture.route} and photographed ${rendered ? `page ${rendered}` : 'a page that does not identify itself'}, not ${capture.pageId}. `
    + 'A screenshot of the wrong route is not evidence of the right one.',
  );
}

/**
 * Stretch every transition and animation on the page, before anything triggers one.
 *
 * The alternative is to trigger, then race to pause the animation before it
 * finishes, and at 140-220ms — which is what these transitions actually are —
 * that race is lost often enough to be useless. The hand-built precedent for
 * this evidence slept 90ms into a 220ms state change and photographed whatever
 * had happened by then; it produced a usable picture and it is not a method,
 * because the same script on a slower host photographs a settled page and calls
 * it mid-flight.
 *
 * Stretching removes the race instead of narrowing it. A CSS transition
 * interpolates on *normalised* progress, so the frame at half of a four-second
 * transition and the frame at half of a 200ms one are the same frame — the
 * easing curve is a function of the fraction, not of the clock. What is lost is
 * any ability to observe the real duration from the capture, so the capture does
 * not claim one: the `during` frame's `proves` says it is not evidence of how
 * long anything takes.
 */
const STRETCHED_MOTION_MS = 4000;

async function stretchMotion(page, milliseconds) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: ${milliseconds}ms !important;
      animation-duration: ${milliseconds}ms !important;
      transition-delay: 0ms !important;
      animation-delay: 0ms !important;
    }`,
  });
}

/**
 * Hold every running animation at a stated fraction of its own duration.
 *
 * Returns how many it caught. Zero is the answer that matters: it means the
 * trigger changed the page without animating anything, so there is no movement
 * to photograph and a `during` frame would be a duplicate of `after` wearing a
 * label that says otherwise.
 */
async function seekMotion(page, progress) {
  return page.evaluate((fraction) => {
    const running = document.getAnimations().filter((animation) => {
      const duration = animation.effect?.getTiming?.()?.duration;
      return typeof duration === 'number' && duration > 0;
    });
    for (const animation of running) {
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration * fraction;
    }
    return running.length;
  }, progress);
}

export async function captureEvidence({ plan, baseUrl, launch = null, onCapture = null, env = process.env } = {}) {
  if (!plan?.captures?.length) return { results: [], failures: [] };
  if (!launch) {
    // Say which browser is missing and how to install it, rather than letting
    // Playwright's own "just installed or updated" notice stand in for a host
    // that never provisioned one. The doctor reports the same sentence, so an
    // operator who reaches this has already been told once.
    const status = await evidenceBrowserStatus({ env });
    if (!status.ready) throw new Error(describeEvidenceBrowser(status));
  }
  const browser = await (launch ? launch() : (await chromium()).launch(launchOptions(env)));
  const results = [];
  const failures = [];
  try {
    for (const capture of plan.captures) {
      const viewport = plan.viewports.find((entry) => entry.name === capture.viewport);
      /*
       * Motion is suppressed for every capture except the frames of a temporal
       * sequence, and that exception is the whole of this change.
       *
       * Forcing `reduce` everywhere is what made the set reproducible, and it is
       * also why five reviews in a row said transition quality could not be
       * judged: the harness had disabled the thing they were asking about. The
       * sequence frames therefore run with motion allowed and are made
       * reproducible a different way — by seeking each animation to a stated
       * fraction of its own duration rather than by photographing it at a
       * moment. Determinism is kept; the means changes.
       *
       * The still keeps `reduce`, which is what makes it the reduced-motion
       * counterpart rather than a second thing to capture.
       */
      const temporal = capture.state.sequence ?? null;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        reducedMotion: temporal ? 'no-preference' : 'reduce',
      });
      const page = await context.newPage();
      try {
        await page.goto(evidenceUrl(capture.route, baseUrl), { waitUntil: 'networkidle', timeout: 20_000 });
        await page.locator('main').waitFor({ timeout: 10_000 });
        if (capture.state.interaction) {
          if (!INTERACTIONS[capture.state.interaction]) throw new Error(`Unknown evidence interaction: ${capture.state.interaction}`);
          if (temporal) {
            // Lazy images settle before the trigger, not after: the sequence is
            // three frames of one moment, and a photograph that decoded between
            // them would read as part of the movement.
            await settleLazyImages(page);
            if (temporal.frame !== 'before') {
              await stretchMotion(page, STRETCHED_MOTION_MS);
              await perform(page, capture.state.interaction);
            }
            if (temporal.frame === 'during') {
              const held = await seekMotion(page, temporal.atProgress);
              if (!held) {
                throw new Error(
                  `Interaction ${capture.state.interaction} declares temporal evidence and animated nothing when triggered at ${capture.viewport}. `
                  + 'A during-frame with no movement behind it is the after-frame with a different label.',
                );
              }
            }
          } else {
            await perform(page, capture.state.interaction);
          }
        }
        if (!temporal) await settleLazyImages(page);
        await assertRenderedIdentity(page, capture);
        // A state may declare that its evidence is a screen rather than a
        // document. Only the disclosed navigation does: its panel overlays what
        // it was opened over, so a full-page image shows a menu floating above
        // an entire page and reads as the navigation having removed it.
        const frame = capture.state.interaction ? INTERACTIONS[capture.state.interaction]?.frame : null;
        // `disabled` fast-forwards animations to their end, which is right for
        // every still and would erase the one frame a sequence exists for. The
        // sequence frames are already held still by `seekMotion`, so allowing
        // them changes nothing about reproducibility.
        const bytes = await page.screenshot({
          fullPage: frame !== 'viewport',
          animations: temporal ? 'allow' : 'disabled',
          type: 'png',
        });
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
