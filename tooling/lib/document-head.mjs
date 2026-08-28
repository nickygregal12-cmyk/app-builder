/**
 * What the document a visitor is actually served says about the project.
 *
 * The application renderer produces a Vite SPA, so `index.html` is the only
 * head anything receives. It shipped `<title>Generated application</title>`
 * with no description and no Open Graph tags, and the seo recipe patched the
 * head after hydration — `document.title = project.name`, once, in JavaScript.
 * Anything that does not execute JavaScript therefore received the scaffold
 * default: a crawler, an answer engine, a link preview, a screen reader reading
 * the tab before the bundle arrives.
 *
 * This module writes that metadata into the document at GENERATION time, which
 * is the seam the generator already uses for everything else project-specific.
 * It is not a post-build regex over `dist`: the file this rewrites is a source
 * file of the generated repository, committed, readable and diffable by whoever
 * receives the handover. Vite copies the head through to the built document
 * untouched, so what is written here is what ships.
 *
 * Two rules govern every field:
 *
 *   - it is DERIVED, never invented. Every emitted value traces to approved
 *     project truth — the project's own name and primary goal — or is a format
 *     constant that asserts nothing about the business (`og:type`);
 *   - what is not known is ABSENT and recorded as withheld, with the reason.
 *     No canonical host, no social image, no locale, no organisation identity.
 *     The build says less rather than saying something it cannot support.
 *
 * The runtime seo recipe is deliberately left in place. It now overwrites the
 * head with the same values it already computed, so it is a no-op for a crawler
 * and still the only thing that can act on `VITE_SITE_URL` supplied at build
 * time by whoever deploys. Removing it would trade a real capability for tidiness.
 *
 * What this does NOT fix, and must not be read as fixing: one document still
 * serves every client-side route. Per-route crawlable metadata is a renderer
 * property, not a head-substitution property, and the answer is
 * `config/renderers.json` — public content sites select the static renderer,
 * which already emits a real document per route. See docs/RENDERER_SELECTION.md.
 */

/**
 * The block the generator owns.
 *
 * The template ships these markers around its placeholder title, so the
 * placeholder is INSIDE the managed region rather than beside it. That is
 * deliberate: if substitution ever fails to run, what survives into `dist` is
 * the literal string `Generated application`, which is the one title the
 * SEO/AEO scanner already refuses. The failure is loud rather than silent.
 */
export const HEAD_OPEN = '<!-- app-builder:document-head -->';
export const HEAD_CLOSE = '<!-- /app-builder:document-head -->';

/** The longest a meta description can be before consumers truncate it. */
export const DESCRIPTION_LIMIT = 160;

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collapse(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * A description consumers will display, cut on a word boundary.
 *
 * The same rule the static renderer's Head.astro already applies, for the same
 * reason: a description is truncated by every consumer anyway, and being cut
 * mid-word is the part that is ours rather than theirs.
 */
function describe(value) {
  const collapsed = collapse(value);
  if (collapsed.length <= DESCRIPTION_LIMIT) return { value: collapsed, truncated: false };
  const cut = collapsed.slice(0, DESCRIPTION_LIMIT);
  const boundary = cut.lastIndexOf(' ');
  return { value: `${(boundary > 80 ? cut.slice(0, boundary) : cut).replace(/[,;:.\s]+$/, '')}…`, truncated: true };
}

/** A site URL the build can actually stand behind, or null. */
function readSiteUrl(candidate) {
  const value = collapse(candidate);
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

/**
 * The head this project's document should carry, and the reason for every
 * field it does not.
 *
 * @param {object} input
 * @param {object} input.project  The manifest's `project` block: approved truth.
 * @returns {{schemaVersion: 1, fields: object[], withheld: object[]}}
 */
export function composeDocumentHead({ project = {} } = {}) {
  const name = collapse(project.name);
  const goal = describe(project.primaryGoal);
  const siteUrl = readSiteUrl(project.siteUrl);

  const fields = [];
  const withheld = [];

  const emit = (key, kind, value, source) => fields.push({ key, kind, value, status: 'derived', source });
  const hold = (key, reason) => withheld.push({ key, status: 'unproven', reason });

  if (name) {
    emit('title', 'title', name, 'manifest.project.name');
    emit('og:title', 'meta-property', name, 'manifest.project.name');
    emit('og:site_name', 'meta-property', name, 'manifest.project.name');
    emit('twitter:title', 'meta-name', name, 'manifest.project.name');
  } else {
    // Unreachable through the manifest contract, which requires a non-blank
    // name. Kept because the alternative to a recorded absence here is the
    // scaffold placeholder surviving, and that is the defect this exists to end.
    hold('title', 'The manifest declares no project name, so no title can be emitted without inventing one.');
  }

  if (goal.value) {
    const source = `manifest.project.primaryGoal${goal.truncated ? ` (truncated to ${DESCRIPTION_LIMIT} characters on a word boundary)` : ''}`;
    emit('description', 'meta-name', goal.value, source);
    emit('og:description', 'meta-property', goal.value, source);
    emit('twitter:description', 'meta-name', goal.value, source);
  } else {
    hold('description', 'The manifest declares no primary goal, so there is no approved sentence to describe this project with.');
  }

  // Format constants. Neither asserts anything about the business: one says the
  // document is a page rather than an article, the other says how a link
  // preview should be laid out.
  emit('og:type', 'meta-property', 'website', 'constant — the document kind, not a claim about the project');
  emit('twitter:card', 'meta-name', 'summary_large_image', 'constant — link preview layout, not a claim about the project');

  if (siteUrl) {
    emit('canonical', 'link-canonical', `${siteUrl}/`, 'manifest.project.siteUrl');
    emit('og:url', 'meta-property', `${siteUrl}/`, 'manifest.project.siteUrl');
  } else {
    const reason = 'No site URL is declared on the manifest, and a canonical address is a claim about where this site lives. Set project.siteUrl to the deployment URL and the canonical and og:url follow.';
    hold('canonical', reason);
    hold('og:url', reason);
  }

  // Held whatever else is known. An image the factory did not receive rights to
  // must not be named, and a locale nothing declared must not be asserted.
  hold('og:image', 'No approved social image exists for this project. The factory publishes no image it was not given rights to, and a link preview with a wrong picture is worse than one with none.');
  hold('og:locale', 'No locale is declared on the manifest. The document keeps the language its template declares rather than gaining a claim about its audience.');

  return { schemaVersion: 1, fields, withheld };
}

/** The managed block, as HTML, indented to sit inside a `<head>`. */
export function renderDocumentHead(head, { indent = '    ' } = {}) {
  const lines = head.fields.map((field) => {
    const value = escapeAttribute(field.value);
    if (field.kind === 'title') return `<title>${value}</title>`;
    if (field.kind === 'link-canonical') return `<link rel="canonical" href="${value}" />`;
    const attribute = field.kind === 'meta-property' ? 'property' : 'name';
    return `<meta ${attribute}="${escapeAttribute(field.key)}" content="${value}" />`;
  });
  return [HEAD_OPEN, ...lines, HEAD_CLOSE].map((line) => `${indent}${line}`).join('\n');
}

/**
 * Replace the managed block in a document.
 *
 * A document that declares a head seam and carries no markers is a mismatch
 * between a template and this generator, and it fails closed. The alternative —
 * appending, or silently doing nothing — is how a placeholder title reaches a
 * built artifact while a generator reports success.
 */
export function applyDocumentHead(html, head, { indent = '    ' } = {}) {
  const open = html.indexOf(HEAD_OPEN);
  const close = html.indexOf(HEAD_CLOSE);
  if (open === -1 || close === -1 || close < open) {
    throw new Error(`The document declares a head seam but carries no ${HEAD_OPEN} … ${HEAD_CLOSE} markers, so there is nowhere to write project metadata.`);
  }
  const lineStart = html.lastIndexOf('\n', open) + 1;
  return `${html.slice(0, lineStart)}${renderDocumentHead(head, { indent })}${html.slice(close + HEAD_CLOSE.length)}`;
}
