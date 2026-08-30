import { test as base } from '@playwright/test';

import { DEV_SERVER_DECLARATIONS } from '../../tooling/lib/browser-signals.mjs';
import { expect, withBrowserSignals } from '../support/browser-signals';

/**
 * The accessibility lane's base test.
 *
 * axe reads the DOM. A component that throws after committing its markup leaves
 * that markup exactly where it was, so the audit walks a tree that renders and
 * reports no serious violation on a page a person cannot use. "No serious or
 * critical WCAG violations" is a claim about a working page, and until now
 * nothing in this lane checked the working part.
 *
 * The dev-server declarations only. This lane serves a static marketing build
 * and never speaks to Supabase, so it does not carry the PostgREST clock-skew
 * excuse: an exception it would never encounter is one it has no business
 * having considered.
 */

export const test = withBrowserSignals(base, DEV_SERVER_DECLARATIONS, { readOnly: true });

export { expect };
