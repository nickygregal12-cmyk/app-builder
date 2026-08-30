import { test as base } from '@playwright/test';

import { DEV_SERVER_DECLARATIONS } from '../../tooling/lib/browser-signals.mjs';
import { expect, withBrowserSignals } from '../support/browser-signals';

/**
 * The synthetic mixed-source lane's base test.
 *
 * This lane's claim is that a source pack becomes "a navigable source-backed
 * standalone website". Navigable is the part a locator can check; standalone
 * and working are not. A page whose hero renders from a knowledge fact while a
 * required stylesheet or image answers 500 satisfies every assertion in the
 * spec and is not the thing the claim describes.
 *
 * Dev-server declarations only; this lane has no database in front of it.
 */

export const test = withBrowserSignals(base, DEV_SERVER_DECLARATIONS, { readOnly: true });

export { expect };
