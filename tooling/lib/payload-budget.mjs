/**
 * Stage Q4 — what a visitor is actually asked to download.
 *
 * Measure before optimising, and measure the right thing. A build log reports
 * how big the bundle is; it does not report how many addresses resolve to a
 * real document, which for a marketing site is the number that decides whether
 * a crawler and a person on a phone see the same page.
 *
 * Two renderers, two shapes, and one budget file would be wrong for both. The
 * static renderer produces a document per route and no script; the application
 * renderer produces one shell and one bundle. So budgets are per project class
 * and the numbers come from a measured build rather than from a round figure
 * that sounded strict.
 *
 * Nothing here decides a threshold. It measures, and
 * `config/payload-budgets.json` holds what was measured and what headroom was
 * allowed, so raising a budget is a diff rather than an argument.
 */

import fs from 'node:fs';
import path from 'node:path';

/** How a file is counted. Anything unrecognised is `other` rather than ignored. */
export const PAYLOAD_KINDS = Object.freeze(['js', 'css', 'html', 'image', 'font', 'other']);

const BY_EXTENSION = Object.freeze({
  '.js': 'js', '.mjs': 'js', '.cjs': 'js',
  '.css': 'css',
  '.html': 'html',
  '.avif': 'image', '.webp': 'image', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.svg': 'image',
  '.woff': 'font', '.woff2': 'font', '.ttf': 'font', '.otf': 'font',
});

export const PAYLOAD_CHECKS = Object.freeze({
  'payload-over-budget': {
    severity: 'violation',
    title: 'A payload dimension exceeded its recorded budget',
    guidance: 'The budget is what this project class measured plus stated headroom. Reduce the payload, or record a new baseline and say in the diff what earned it.',
  },
  'requests-over-budget': {
    severity: 'violation',
    title: 'A route asks for more subresources than its budget allows',
    guidance: 'Every extra request is a round trip before the page is usable. Combine, inline or drop one, or record a new baseline.',
  },
  'route-documents-below-minimum': {
    severity: 'violation',
    title: 'Fewer route documents than the class requires',
    guidance: 'A static class that emits one document is an application shell wearing a static renderer. Check the renderer selection before changing this floor.',
  },
});

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Subresources a document asks the browser for, counted from the markup. */
export function documentRequests(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\ssrc\s*=/gi)].length;
  const styles = [...html.matchAll(/<link\b[^>]*\srel\s*=\s*["']?stylesheet/gi)].length;
  const preloads = [...html.matchAll(/<link\b[^>]*\srel\s*=\s*["']?(?:preload|modulepreload)/gi)].length;
  const images = [...html.matchAll(/<img\b[^>]*\ssrc\s*=/gi)].length;
  const sources = [...html.matchAll(/<source\b[^>]*\ssrcset\s*=/gi)].length;
  return { scripts, styles, preloads, images, sources, total: scripts + styles + preloads + images + sources };
}

/**
 * Measure one built directory.
 *
 * `routeDocuments` excludes Netlify's `__forms.html`, which is a form
 * definition rather than an address a visitor reaches — counting it would
 * inflate the one number this measurement exists to report honestly.
 */
export function measureBuildPayload(distDir) {
  const files = walk(distDir);
  const bytes = Object.fromEntries(PAYLOAD_KINDS.map((kind) => [kind, 0]));
  const routes = [];

  for (const file of files) {
    const size = fs.statSync(file).size;
    const relative = path.relative(distDir, file).split(path.sep).join('/');
    const kind = BY_EXTENSION[path.extname(file).toLowerCase()] ?? 'other';
    bytes[kind] += size;
    if (kind === 'html' && path.basename(file) !== '__forms.html') {
      const html = fs.readFileSync(file, 'utf8');
      routes.push({
        route: `/${relative.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')}`,
        file: relative,
        bytes: size,
        requests: documentRequests(html),
      });
    }
  }

  routes.sort((left, right) => left.route.localeCompare(right.route));
  return {
    schemaVersion: 1,
    authority: 'payload-budget',
    files: files.length,
    bytes,
    totalBytes: Object.values(bytes).reduce((sum, value) => sum + value, 0),
    routeDocuments: routes.length,
    routes,
    maxRouteRequests: routes.reduce((most, route) => Math.max(most, route.requests.total), 0),
  };
}

/**
 * Hold a measurement against a class's recorded budget.
 *
 * A class with no recorded budget produces no findings and says so, because a
 * silent pass and "nothing is watching this class" look identical in a status
 * and are not the same thing.
 */
export function evaluatePayloadBudgets({ measurement, budget, projectType, compositionHash = null }) {
  const findings = [];
  if (!budget) {
    return {
      schemaVersion: 1,
      authority: 'payload-budget',
      projectType,
      compositionHash,
      budgeted: false,
      routeDocuments: measurement.routeDocuments,
      measurement,
      findings,
      clean: true,
    };
  }

  // Shared payload only. Total bytes and total HTML scale with how many pages a
  // project has, which is a property of the project rather than of its class, so
  // a class budget on them would punish a large site and excuse a small one.
  for (const [kind, limit] of Object.entries(budget.maxBytes ?? {})) {
    const actual = measurement.bytes[kind] ?? 0;
    if (actual > limit) {
      findings.push({
        check: 'payload-over-budget',
        ...PAYLOAD_CHECKS['payload-over-budget'],
        dimension: kind,
        actual,
        limit,
        detail: `${kind} is ${actual} bytes against a budget of ${limit}`,
      });
    }
  }

  if (typeof budget.maxRouteDocumentBytes === 'number') {
    for (const route of measurement.routes) {
      if (route.bytes > budget.maxRouteDocumentBytes) {
        findings.push({
          check: 'payload-over-budget',
          ...PAYLOAD_CHECKS['payload-over-budget'],
          dimension: `document:${route.route}`,
          actual: route.bytes,
          limit: budget.maxRouteDocumentBytes,
          detail: `${route.route} is ${route.bytes} bytes against a per-document budget of ${budget.maxRouteDocumentBytes}`,
        });
      }
    }
  }

  if (typeof budget.maxRouteRequests === 'number') {
    for (const route of measurement.routes) {
      if (route.requests.total > budget.maxRouteRequests) {
        findings.push({
          check: 'requests-over-budget',
          ...PAYLOAD_CHECKS['requests-over-budget'],
          dimension: route.route,
          actual: route.requests.total,
          limit: budget.maxRouteRequests,
          detail: `${route.route} asks for ${route.requests.total} subresource(s) against a budget of ${budget.maxRouteRequests}`,
        });
      }
    }
  }

  if (typeof budget.minRouteDocuments === 'number' && measurement.routeDocuments < budget.minRouteDocuments) {
    findings.push({
      check: 'route-documents-below-minimum',
      ...PAYLOAD_CHECKS['route-documents-below-minimum'],
      dimension: 'routeDocuments',
      actual: measurement.routeDocuments,
      limit: budget.minRouteDocuments,
      detail: `${measurement.routeDocuments} route document(s) against a floor of ${budget.minRouteDocuments}`,
    });
  }

  return {
    schemaVersion: 1,
    authority: 'payload-budget',
    projectType,
    compositionHash,
    budgeted: true,
    // Lifted out of the measurement so a gate reading this report can say what
    // the pass was over. A budget met by a build with one document is a
    // different claim from one met by a build with six.
    routeDocuments: measurement.routeDocuments,
    measurement,
    findings,
    clean: findings.length === 0,
  };
}
