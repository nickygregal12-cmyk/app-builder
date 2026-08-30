import { test as base } from '@playwright/test';

import { HARNESS_DECLARATIONS } from '../../tooling/lib/browser-signals.mjs';
import { expect, withBrowserSignals } from '../support/browser-signals';

/**
 * The base every generated-application journey runs on.
 *
 * The mechanism lives in `tests/support/browser-signals.ts` and is shared with
 * the other lanes that make a claim about a rendered product. What is specific
 * to this one is the pair of things in front of it — a Vite dev server and a
 * local Supabase stack — which is why it takes `HARNESS_DECLARATIONS` rather
 * than the dev-server set alone.
 *
 * Specs import `test` and `expect` from here rather than from `@playwright/test`
 * so that a journey cannot opt out by accident, and
 * `tooling/generated-app-journey-evidence.test.mjs` holds that as a contract
 * rather than a habit.
 */

export const test = withBrowserSignals(base, HARNESS_DECLARATIONS);

export { expect };
