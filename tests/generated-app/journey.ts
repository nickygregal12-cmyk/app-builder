import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

import {
  HARNESS_DECLARATIONS,
  consoleSignalKind,
  describeGatedSignals,
  summariseJourneySignals,
} from '../../tooling/lib/browser-signals.mjs';

/**
 * The base every generated-application journey runs on.
 *
 * A journey asserts what it can see. This asks the browser what it saw, which
 * is the half no locator reaches: an uncaught exception, a console error, a
 * request that never completed, or a response at 400 or worse. Before this
 * existed a journey could take all four and still pass, because the markup its
 * assertions name was rendered before anything went wrong.
 *
 * Specs import `test` and `expect` from here rather than from `@playwright/test`
 * so that a journey cannot opt out by accident, and
 * `tooling/generated-app-journey-evidence.test.mjs` holds that as a contract
 * rather than a habit.
 */

type Signal = {
  kind: string;
  text?: string;
  url?: string;
  method?: string;
  status?: number;
  failure?: string;
  at: number;
};

type Declaration = {
  id: string;
  kinds: string[];
  match: { url?: string; status?: number[]; failure?: string; text?: string };
  because: string;
};

export type JourneySignals = {
  /**
   * Declare a signal this journey deliberately provokes.
   *
   * A journey that drives a refusal on purpose should say so, in the journey,
   * with the reason — rather than the reason living in a central allowlist that
   * outlives the test that needed it. The declaration travels into the evidence,
   * so a reviewer reads why a 403 was acceptable at the same time as they see it.
   */
  declare(declaration: Declaration): void;
};

/**
 * How much of an error response to keep.
 *
 * Enough for an API's own error code and message, which is the part that turns
 * a status into a diagnosis, and not so much that a stack trace from a 500 ends
 * up in the evidence of every journey that saw it.
 */
const BODY_LIMIT = 400;

function collect(page: Page, sink: Signal[], pending: Promise<unknown>[]) {
  const at = () => sink.length;
  page.on('pageerror', (error) => {
    sink.push({ kind: 'page-error', text: error.stack ?? String(error), url: page.url(), at: at() });
  });
  page.on('console', (message) => {
    const kind = consoleSignalKind(message.type());
    if (!kind) return;
    sink.push({ kind, text: message.text(), url: page.url(), at: at() });
  });
  page.on('requestfailed', (request) => {
    sink.push({
      kind: 'request-failed',
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? 'unknown',
      at: at(),
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const signal: Signal = {
      kind: 'http-error',
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      at: at(),
    };
    sink.push(signal);
    // Read after pushing, and awaited in teardown rather than here. A response
    // body arrives asynchronously and can be gone by the time it is asked for —
    // the request was cancelled, or the context has closed — so the signal is
    // recorded first and enriched if the body turns up. The gate must never
    // depend on a body being readable.
    pending.push(
      response.text().then(
        (body) => { signal.body = body.slice(0, BODY_LIMIT); },
        () => { signal.body = undefined; },
      ),
    );
  });
}

function watch(context: BrowserContext, sink: Signal[], pending: Promise<unknown>[]) {
  for (const page of context.pages()) collect(page, sink, pending);
  context.on('page', (page) => collect(page, sink, pending));
}

export const test = base.extend<{ journeySignals: JourneySignals }>({
  journeySignals: [
    async ({ context, browser }, use, testInfo) => {
      const sink: Signal[] = [];
      const pending: Promise<unknown>[] = [];
      const declarations: Declaration[] = [...HARNESS_DECLARATIONS];

      watch(context, sink, pending);

      // The notifications journey is three people, so it opens its own contexts
      // through the worker-scoped `browser` rather than using the one this
      // fixture was given. Playwright offers no event for a context being
      // created, so the only way to see those pages is to intercept the call
      // that makes them. The patch is removed in teardown and the lane runs
      // `workers: 1, fullyParallel: false`, so no other test is ever inside this
      // window.
      //
      // The cost of depending on `context` here is one unused context for a test
      // that only asked for `browser`. That is cheaper than the alternative,
      // which is a fixture whose ordering against the built-in `context` fixture
      // is not guaranteed and which would therefore watch some journeys and not
      // others without ever saying which.
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...args) => {
        const created = await newContext(...args);
        watch(created, sink, pending);
        return created;
      };

      await use({
        declare(declaration: Declaration) {
          declarations.push(declaration);
        },
      });

      browser.newContext = newContext;

      // Every error body that is still arriving. Classifying before these settle
      // would judge a 401 without the code that says whether it is the product
      // or the clock.
      await Promise.allSettled(pending);

      const summary = summariseJourneySignals(sink, declarations);
      await testInfo.attach('browser-signals', {
        body: JSON.stringify({ schemaVersion: 1, journey: testInfo.title, file: testInfo.titlePath[0], declarations, ...summary }, null, 2),
        contentType: 'application/json',
      });

      // A journey that already failed keeps its own failure as the story. The
      // signals are attached either way, so whatever the browser reported is in
      // the evidence for whoever reads the failure — this only decides whether
      // they are also the stated cause.
      if (testInfo.status === 'passed' && !summary.clean) {
        throw new Error(
          `The journey passed its assertions while the browser reported ${summary.gated.length} error(s):\n`
          + describeGatedSignals(summary.gated).map((line) => `  - ${line}`).join('\n')
          + '\n\nIf a journey provokes one of these deliberately, declare it with journeySignals.declare({...}) and say why.',
        );
      }
    },
    { auto: true },
  ],
});

export { expect };
