import fs from 'node:fs';
import path from 'node:path';

/**
 * The routes this lane audits, read from what the generator actually composed.
 *
 * They used to be a hardcoded list — `/`, `/services`, `/contact` — and the
 * browser-signal gate caught what that cost the first time it ran. The
 * acceptance manifest declares `company.services: []`, so the composer
 * correctly produces no services page, and the dev server answered `/services`
 * with a 404 carrying the site's own branded "Page not found" document. axe
 * then audited that document, found nothing wrong with it — it is a
 * well-built 404 — and the lane reported "no serious or critical WCAG
 * violations at /services" for a page that does not exist.
 *
 * Nothing was lying. Every part behaved correctly and the claim was still
 * false, because the population was wrong. Editing the list to the two routes
 * that happen to exist today would fix this run and rot the same way, so the
 * list is derived instead: a route is audited because the composition contains
 * it.
 */

export type Route = { route: string; pageId: string; notFound: boolean };

/**
 * The composed page whose correct answer is 404.
 *
 * `packages/composition/src/index.js` gives the not-found page this exact id,
 * and a not-found page that answered 200 would be a soft-404 — the defect, not
 * the fix. So it is audited like any other page and held to a different status.
 * It is identified by id rather than by its `/404` path because the id is what
 * the composer sets deliberately; the path is a consequence.
 */
const NOT_FOUND_PAGE_ID = 'page-not-found';

export function composedRoutes(projectDir: string): Route[] {
  const file = path.join(projectDir, '.app-builder/composition.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `No composition at ${file}. This lane audits the pages the generator composed, so it cannot run against a project `
      + 'whose composition it cannot read — guessing routes is what it stopped doing.',
    );
  }
  const composition = JSON.parse(fs.readFileSync(file, 'utf8'));
  // `path` is the field `schemas/page-spec.schema.json` requires, and it is
  // read as the contract rather than as one of several names that might work.
  // Accepting `route` as a fallback would mean this quietly audits nothing on
  // the day the contract changes, which is the failure it was written to stop.
  const pages = composition.pages ?? [];
  const routes: Route[] = pages
    .filter((page: { path?: string }) => typeof page.path === 'string' && page.path.startsWith('/'))
    .map((page: { id?: string; path: string }) => ({
      pageId: String(page.id ?? 'unknown'),
      route: page.path,
      notFound: page.id === NOT_FOUND_PAGE_ID,
    }));

  if (!routes.length) {
    throw new Error(
      `The composition at ${file} declares ${pages.length} page(s) and no readable \`path\`. An accessibility lane with `
      + 'nothing to audit is not a passing lane, so this refuses rather than reporting a clean run over an empty list.',
    );
  }
  return routes;
}
