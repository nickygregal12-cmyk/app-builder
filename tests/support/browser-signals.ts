import { expect, type BrowserContext, type Page, type TestType } from '@playwright/test';

import {
  consoleSignalKind,
  describeGatedSignals,
  isMutation,
  summariseJourneySignals,
} from '../../tooling/lib/browser-signals.mjs';

/**
 * Ask the browser what it saw, in any lane.
 *
 * A test asserts what it can find on the page. None of them ask whether the
 * page threw on the way, and that gap is not specific to one lane — it is the
 * same hole wherever a claim is made about a rendered product:
 *
 *   - the accessibility lane reports "no serious WCAG violations" from a DOM
 *     that axe walked happily while an uncaught exception sat in the console.
 *     A component that threw after its markup was committed leaves that markup
 *     in place, so the audit is of a page nobody could use;
 *   - the real-business lane reports "a navigable source-backed website" while
 *     a required asset answers 500;
 *   - the portability lane reports "renders in four engines" when what it saw
 *     was four engines each reporting an error to a console nobody read.
 *
 * So this is the mechanism from the generated-application lane, extracted
 * rather than copied. The classifier, the declaration vocabulary and the
 * evidence semantics are shared; what each lane supplies is its own
 * declarations, because what is ordinary for a Vite dev server in front of a
 * static site is not what is ordinary for one in front of Supabase.
 *
 * The rule a lane cannot opt out of stays the same: an uncaught exception is
 * never declarable.
 */

type Signal = {
  kind: string;
  text?: string;
  url?: string;
  method?: string;
  status?: number;
  failure?: string;
  body?: string;
  at: number;
};

export type Declaration = {
  id: string;
  kinds: string[];
  match: { url?: string; status?: number[]; failure?: string; text?: string; body?: string };
  because: string;
};

export type BrowserSignals = {
  /**
   * Declare a signal this test deliberately provokes.
   *
   * The reason lives with the test that needed it rather than in a central
   * allowlist that outlives it, and travels into the evidence beside the signal
   * it excused.
   */
  declare(declaration: Declaration): void;
};

const BODY_LIMIT = 400;
const MUTATION_CAP = 50;

type Mutation = { method: string; url: string; status: number };

function collect(page: Page, sink: Signal[], pending: Promise<unknown>[], mutations: Mutation[]) {
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
    const method = response.request().method();
    if (isMutation({ method, status: response.status() }) && mutations.length < MUTATION_CAP) {
      mutations.push({ method, url: response.url(), status: response.status() });
    }
    if (response.status() < 400) return;
    const signal: Signal = {
      kind: 'http-error',
      url: response.url(),
      method,
      status: response.status(),
      at: at(),
    };
    sink.push(signal);
    // Recorded first, enriched if the body turns up. A body arrives
    // asynchronously and can be gone by the time it is asked for; the gate must
    // never depend on one being readable.
    pending.push(
      response.text().then(
        (body) => { signal.body = body.slice(0, BODY_LIMIT); },
        () => { signal.body = undefined; },
      ),
    );
  });
}

function watch(context: BrowserContext, sink: Signal[], pending: Promise<unknown>[], mutations: Mutation[]) {
  for (const page of context.pages()) collect(page, sink, pending, mutations);
  context.on('page', (page) => collect(page, sink, pending, mutations));
}

/**
 * Extend a lane's base test so every page it opens is watched.
 *
 * `laneDeclarations` is what this lane considers ordinary, and it is the only
 * thing a lane is expected to supply. Everything else — what counts as a
 * signal, what may never be declared, how a write is recognised — is the same
 * everywhere on purpose.
 */
export function withBrowserSignals<T extends TestType<any, any>>(
  base: T,
  laneDeclarations: readonly Declaration[],
  { readOnly = false }: { readOnly?: boolean } = {},
) {
  return base.extend<{ browserSignals: BrowserSignals }>({
    browserSignals: [
      async ({ context, browser }: any, use: any, testInfo: any) => {
        const sink: Signal[] = [];
        const pending: Promise<unknown>[] = [];
        const mutations: Mutation[] = [];
        const declarations: Declaration[] = [...laneDeclarations];

        watch(context, sink, pending, mutations);

        // Contexts a test opens for itself are invisible otherwise: Playwright
        // offers no event for a context being created, so the only way to see
        // their pages is to intercept the call that makes them. Restored in
        // teardown, and these lanes run one worker without full parallelism, so
        // no other test is ever inside this window.
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async (...args: unknown[]) => {
          const created = await newContext(...args);
          watch(created, sink, pending, mutations);
          return created;
        };

        await use({
          declare(declaration: Declaration) {
            declarations.push(declaration);
          },
        });

        browser.newContext = newContext;
        await Promise.allSettled(pending);

        const summary = summariseJourneySignals(sink, declarations);
        await testInfo.attach('browser-signals', {
          body: JSON.stringify({ schemaVersion: 1, journey: testInfo.title, file: testInfo.titlePath[0], declarations, mutations, ...summary }, null, 2),
          contentType: 'application/json',
        });

        // A lane that says it cannot change its own evidence subject is the
        // reason its retries are safe. If it starts writing, that reasoning is
        // stale, and the moment to notice is now rather than the first time a
        // retry quietly reruns against what the previous attempt left behind.
        if (readOnly && mutations.length && testInfo.status === 'passed') {
          throw new Error(
            `This lane is declared read-only, and it wrote:\n`
            + mutations.map((m: Mutation) => `  - ${m.method} ${m.url} (${m.status})`).join('\n')
            + '\n\nRetries are only safe here because nothing changes between attempts. Either stop the write, or drop the'
            + ' read-only declaration and give the lane the retry rules a mutating lane needs.',
          );
        }

        // A test that already failed keeps its own failure as the story. The
        // signals are attached either way, so whatever the browser reported is
        // in the evidence for whoever reads it; this only decides whether they
        // are also the stated cause.
        if (testInfo.status === 'passed' && !summary.clean) {
          throw new Error(
            `This passed its assertions while the browser reported ${summary.gated.length} error(s):\n`
            + describeGatedSignals(summary.gated).map((line: string) => `  - ${line}`).join('\n')
            + '\n\nIf it provokes one of these deliberately, declare it with browserSignals.declare({...}) and say why.',
          );
        }
      },
      { auto: true },
    ],
  });
}

export { expect };
