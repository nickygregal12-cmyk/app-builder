/**
 * What does this build actually tell a crawler or an answer engine about itself?
 *
 * `gates.seo` has declared one deterministic check, `seo-aeo-scanner`, since the
 * gate registry was written, and no producer has ever answered it. A gate whose
 * only check has no producer is permanently `not-run`, so the seo gate has never
 * been measured on any build — it has only ever been declared.
 *
 * The subject is the BUILT DOCUMENTS, not the composition. That distinction is
 * the whole point of this producer. A composition can carry a perfect title for
 * every route and still ship one document that says something else, because what
 * a renderer emits is a separate fact from what a composer decided. Reading the
 * composition here would grade the factory's intention; reading `dist` grades
 * what a crawler receives. It is the same rule the rendered-evidence lane
 * learned the hard way — evidence has to depict what ships.
 *
 * Two things it deliberately does NOT do:
 *
 *   - it does not score. `gates.seo` sets `minimumScore: null`, and a number
 *     invented here would be a judgement wearing a measurement's clothes. It
 *     reports findings, and the gate's own rules decide;
 *   - it does not fail a build for not knowing its own public URL. Without a
 *     site URL a canonical link, an `og:url` and a `WebSite` object are all
 *     claims about where the site lives, and the factory refuses to invent
 *     those. That refusal is recorded as an advisory limit, never as a defect.
 *
 * Head metadata is extracted with regular expressions rather than a parser
 * because the repository has no HTML parser and this reads a small, known,
 * generator-emitted head rather than arbitrary web HTML. Every extractor below
 * is anchored and case-insensitive, and anything it cannot read is reported as
 * absent rather than assumed present — the failure direction that cannot
 * manufacture a pass.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Titles that mean a scaffold shipped with its placeholder intact.
 *
 * `Generated application` is the literal string in
 * `templates/react-vite-neutral/files/index.html`. The others are the common
 * leftovers from the same family of tools. Comparison is lowercased and
 * trimmed, so casing changes do not smuggle one past.
 */
export const PLACEHOLDER_TITLES = Object.freeze(new Set([
  'generated application',
  'generated app',
  'vite + react',
  'vite app',
  'react app',
  'astro',
  'document',
  'untitled',
]));

/** The longest a title or description can be before consumers truncate it. */
export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 160;

export const SEO_AEO_CHECKS = Object.freeze({
  'document-title-missing': {
    severity: 'blocker',
    title: 'A document ships with no title',
    guidance: 'Every document needs a <title>. It is the single strongest signal a crawler reads and the line a person sees in results.',
  },
  'document-title-placeholder': {
    severity: 'blocker',
    title: 'A document ships with a scaffold placeholder title',
    guidance: 'The template default reached the built output. Emit the project or page title into the document head rather than setting it after hydration.',
  },
  'document-title-duplicated': {
    severity: 'blocker',
    title: 'Several documents share one title',
    guidance: 'Distinct routes need distinct titles, or a crawler cannot tell them apart and an answer engine cannot cite the right one.',
  },
  'document-description-missing': {
    severity: 'blocker',
    title: 'A document ships with no meta description',
    guidance: 'Emit a description derived from the page\'s own approved copy. Do not invent a claim to fill it.',
  },
  'document-description-duplicated': {
    severity: 'blocker',
    title: 'Several documents share one meta description',
    guidance: 'A description repeated across routes describes the site, not the page, and answers no question a searcher asked.',
  },
  'document-heading-missing': {
    severity: 'blocker',
    title: 'A document has no top-level heading',
    guidance: 'An answer engine needs one stated claim per document. A page whose main heading only appears after hydration has none in what ships.',
  },
  'route-metadata-not-crawlable': {
    severity: 'blocker',
    title: 'Declared routes do not each ship a document',
    guidance: 'The composition declares more routes than the build serves documents, so every route shares one head. Per-route metadata that exists only after client JavaScript runs is not metadata a crawler or an answer engine receives.',
  },
  'structured-data-unparseable': {
    severity: 'blocker',
    title: 'A structured-data block is not valid JSON',
    guidance: 'A ld+json block that will not parse is worse than none: it asserts the site publishes structured data and delivers nothing.',
  },
  'canonical-missing': {
    severity: 'blocker',
    title: 'The site URL is known and no canonical link was emitted',
    guidance: 'When the deployment URL is known, every document should state its own canonical address.',
  },
  // --- Advisory. Recorded, never failing. -----------------------------------
  'canonical-unavailable': {
    severity: 'advisory',
    title: 'No site URL is declared, so no canonical or structured data can be emitted',
    guidance: 'This is a limit of what the build knows, not a defect. Supply the deployment URL and the canonical, og:url and WebSite object follow. Do not invent one.',
  },
  'document-title-too-long': {
    severity: 'advisory',
    title: 'A title is longer than consumers display',
    guidance: `Titles beyond ${TITLE_LIMIT} characters are truncated by most consumers.`,
  },
  'document-description-too-long': {
    severity: 'advisory',
    title: 'A meta description is longer than consumers display',
    guidance: `Descriptions beyond ${DESCRIPTION_LIMIT} characters are truncated by most consumers.`,
  },
  'document-heading-multiple': {
    severity: 'advisory',
    title: 'A document states more than one top-level heading',
    guidance: 'Several h1 elements leave the document\'s single main claim ambiguous.',
  },
  'document-language-missing': {
    severity: 'advisory',
    title: 'A document declares no language',
    guidance: 'Set lang on the html element so assistive technology and translation know what they are reading.',
  },
});

/** Findings that fail the gate check. Everything else is recorded and advisory. */
export const BLOCKING_CHECKS = Object.freeze(
  Object.entries(SEO_AEO_CHECKS).filter(([, check]) => check.severity === 'blocker').map(([id]) => id),
);

// --- Extraction --------------------------------------------------------------
// Anchored, case-insensitive, and absent-on-doubt. None of these may guess.

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HTML_LANG = /<html\b[^>]*\slang\s*=\s*["']([^"']+)["']/i;
const LD_JSON = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const CANONICAL = /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i;
const H1 = /<h1\b[^>]*>/gi;

/** A `<meta name|property="key" content="…">` in either attribute order. */
function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forward = new RegExp(`<meta\\b[^>]*\\b(?:name|property)\\s*=\\s*["']${escaped}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`, 'i');
  const reverse = new RegExp(`<meta\\b[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\b(?:name|property)\\s*=\\s*["']${escaped}["']`, 'i');
  return (html.match(forward) ?? html.match(reverse))?.[1] ?? null;
}

/** Collapse entities and whitespace enough to compare two titles honestly. */
function normalise(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Everything this producer reads out of one built document. */
export function readDocument(html) {
  const structuredData = [];
  for (const match of html.matchAll(LD_JSON)) {
    const body = match[1].trim();
    let parsed = null;
    let error = null;
    try { parsed = JSON.parse(body); } catch (cause) { error = cause.message; }
    structuredData.push({ body, parsed, error });
  }
  return {
    title: normalise(html.match(TITLE)?.[1] ?? '') || null,
    description: normalise(metaContent(html, 'description') ?? '') || null,
    ogTitle: normalise(metaContent(html, 'og:title') ?? '') || null,
    canonical: CANONICAL.test(html),
    language: html.match(HTML_LANG)?.[1]?.trim() || null,
    headings: [...html.matchAll(H1)].length,
    structuredData,
  };
}

/**
 * Every HTML document in a built output directory, in stable order.
 *
 * Sorted because a findings list whose order depends on the filesystem is not
 * deterministic evidence, and this artifact is compared across builds.
 */
export function readBuiltDocuments(distRoot) {
  const documents = [];
  if (!fs.existsSync(distRoot)) return documents;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith('.html')) {
        documents.push({ path: path.relative(distRoot, full).split(path.sep).join('/'), html: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(distRoot);
  return documents.sort((a, b) => a.path.localeCompare(b.path));
}

// --- The scan ----------------------------------------------------------------

function finding(check, where, detail) {
  return { check, ...SEO_AEO_CHECKS[check], where, detail };
}

/**
 * @param {object} input
 * @param {{path: string, html: string}[]} input.documents  The built documents a visitor is served.
 * @param {number} input.routesDeclared   How many routes the composition declares.
 * @param {string|null} input.siteUrl     The deployment URL, when the build knows it.
 * @param {string|null} input.compositionHash  The build this report is evidence for.
 */
export function scanSeoAeo({ documents = [], routesDeclared = 0, siteUrl = null, compositionHash = null } = {}) {
  const findings = [];
  const read = documents.map((document) => ({ ...document, ...readDocument(document.html) }));
  const knowsSiteUrl = typeof siteUrl === 'string' && siteUrl.trim() !== '';

  for (const document of read) {
    const where = `document ${document.path}`;

    if (!document.title) {
      findings.push(finding('document-title-missing', where, 'The document head carries no non-empty <title>.'));
    } else {
      if (PLACEHOLDER_TITLES.has(document.title.toLowerCase())) {
        findings.push(finding('document-title-placeholder', where, `The title is "${document.title}", which is a scaffold default rather than this project's.`));
      }
      if (document.title.length > TITLE_LIMIT) {
        findings.push(finding('document-title-too-long', where, `${document.title.length} characters against a ${TITLE_LIMIT}-character display limit.`));
      }
    }

    if (!document.description) {
      findings.push(finding('document-description-missing', where, 'The document head carries no non-empty meta description.'));
    } else if (document.description.length > DESCRIPTION_LIMIT) {
      findings.push(finding('document-description-too-long', where, `${document.description.length} characters against a ${DESCRIPTION_LIMIT}-character display limit.`));
    }

    if (document.headings === 0) {
      findings.push(finding('document-heading-missing', where, 'The served document contains no h1 element.'));
    } else if (document.headings > 1) {
      findings.push(finding('document-heading-multiple', where, `${document.headings} h1 elements.`));
    }

    if (!document.language) {
      findings.push(finding('document-language-missing', where, 'The html element declares no lang attribute.'));
    }

    for (const block of document.structuredData) {
      if (block.error) {
        findings.push(finding('structured-data-unparseable', where, `A ld+json block did not parse: ${block.error}`));
      }
    }

    if (knowsSiteUrl && !document.canonical) {
      findings.push(finding('canonical-missing', where, `The site URL ${siteUrl} is known and this document emits no canonical link.`));
    }
  }

  // Duplication is a property of the set, so it is decided once rather than per
  // document. A single-document build cannot duplicate anything, and reporting
  // it as clean on that basis would be true and misleading — the routes check
  // below is the one that speaks to a single document serving many routes.
  for (const [field, check] of [['title', 'document-title-duplicated'], ['description', 'document-description-duplicated']]) {
    const groups = new Map();
    for (const document of read) {
      const value = document[field];
      if (!value) continue;
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(document.path);
    }
    for (const [value, paths] of groups) {
      if (paths.length > 1) {
        findings.push(finding(check, `documents ${paths.join(', ')}`, `${paths.length} documents share the ${field} "${value}".`));
      }
    }
  }

  // The finding this producer exists to be able to make. A composition that
  // declares six routes and a build that serves one document means five routes
  // have no head of their own, whatever the client-side code does afterwards.
  if (routesDeclared > documents.length) {
    findings.push(finding(
      'route-metadata-not-crawlable',
      `build serving ${documents.length} document(s)`,
      `The composition declares ${routesDeclared} routes and the build serves ${documents.length} HTML document(s), so ${routesDeclared - documents.length} route(s) have no document head of their own.`,
    ));
  }

  if (!knowsSiteUrl) {
    findings.push(finding('canonical-unavailable', 'build', 'No site URL was supplied, so canonical links, og:url and the WebSite object are correctly withheld rather than invented.'));
  }

  const blocking = findings.filter((entry) => entry.severity === 'blocker');
  return {
    schemaVersion: 1,
    authority: 'seo-aeo-scanner',
    compositionHash,
    // What was actually looked at. A pass over nothing is still a pass and this
    // is what makes the difference visible in the gate report.
    documentsScanned: documents.length,
    routesDeclared,
    siteUrlKnown: knowsSiteUrl,
    findings,
    clean: blocking.length === 0,
  };
}
