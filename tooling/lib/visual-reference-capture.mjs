/**
 * Trusted capture of a supplied reference URL.
 *
 * A person pastes a link to a site they like. Something has to go and look at
 * it, and the two obvious ways of doing that are both wrong. Handing an
 * arbitrary generated project a browser and letting it fetch whatever it likes
 * turns every build into an egress hole; fetching it from the service with no
 * boundary makes the factory a confused deputy that will happily photograph
 * `http://169.254.169.254/latest/meta-data/`.
 *
 * So capture is a factory-side capability with one entrance, and the entrance
 * is a refusal:
 *
 *   supplied URL
 *     -> scheme, then destination classification, then DNS resolution
 *     -> EVERY request the page makes re-classified — documents, redirects,
 *        images, scripts, stylesheets, fonts, fetch and XHR alike — because the
 *        boundary is about where the browser connects, not about which kind of
 *        request asked it to
 *     -> service workers blocked, WebSockets refused, so there is no second
 *        request path with no filter on it
 *     -> a trusted Chromium at two widths
 *     -> measurements
 *
 * `assertPublicEgressDestination` from the control plane does the classifying.
 * That module already knows that `127.1`, `0x7f.1`, `2130706433` and
 * `::ffff:127.0.0.1` are the same destination, and a second, weaker list here
 * would be a filter a reference URL could walk around.
 *
 * What comes back is numbers. The page's text, markup, stylesheet and images
 * are read inside the browser to produce those numbers and are never returned:
 * `assertReferenceIsNotContent` refuses an observation that carries any of
 * them, and the measurement functions below are written so there is nothing for
 * it to refuse.
 */

import dns from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { assertPublicEgressDestination } from '../../packages/control-plane/src/egress-policy.js';
import { describeEvidenceBrowser, evidenceBrowserStatus } from './evidence-browser.mjs';

export const REFERENCE_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 }),
]);

export const MAXIMUM_REDIRECTS = 5;
export const CAPTURE_TIMEOUT_MS = 25_000;

/**
 * Refuse a reference URL before anything opens a socket to it.
 *
 * `lookup` is injected so the refusal path is testable without a resolver, and
 * so a test for "a public name that resolves to 127.0.0.1" does not need a
 * cooperating DNS server to exist.
 */
export async function assertSafeReferenceUrl(value, { lookup = dns.lookup, hostAddresses = [] } = {}) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`A design reference URL must be a URL: ${String(value)}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`A design reference can only be captured over http or https. ${url.protocol} is refused.`);
  }
  if (url.username || url.password) {
    throw new Error('A design reference URL must not carry credentials.');
  }
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '');
  let resolvedAddresses = null;
  const named = !/^[0-9.]+$/.test(host) && !host.includes(':');
  if (named) {
    let records;
    try {
      records = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error(`Refusing to capture ${url.href}: ${host} does not resolve.`);
    }
    resolvedAddresses = (Array.isArray(records) ? records : [records]).map((record) => record.address);
  }
  assertPublicEgressDestination(host, { hostAddresses, resolvedAddresses });
  return url;
}

/**
 * The measurement script, run inside the page.
 *
 * Everything it returns is a number, a boolean or a short enumerated string.
 * It reads text and markup — it has to, to count headings and measure a column
 * — and returns none of it.
 *
 * Exported so a real-browser exercise can run exactly this function over a
 * fixture page. The safety boundary stays in `captureReference` where it
 * belongs: an exercise proving the measurements work must not be able to prove
 * it by relaxing the refusal that keeps the factory off its own loopback.
 */
export function measurePage() {
  const px = (value) => {
    const number = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(number) ? number : 0;
  };
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const rgbLuminance = (colour) => {
    const parts = String(colour).match(/\d+(?:\.\d+)?/g);
    if (!parts || parts.length < 3) return null;
    const channel = (value) => {
      const scaled = Number(value) / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2]);
  };
  const effectiveBackground = (element) => {
    let node = element;
    while (node && node !== document.documentElement.parentElement) {
      const colour = getComputedStyle(node).backgroundColor;
      const parts = String(colour).match(/\d+(?:\.\d+)?/g);
      if (parts && (parts.length < 4 || Number(parts[3]) > 0.05)) return `${parts[0]},${parts[1]},${parts[2]}`;
      node = node.parentElement;
    }
    return '255,255,255';
  };

  const headings = [...document.querySelectorAll('h1, h2, h3')].filter(visible);
  const displaySize = headings.reduce((largest, heading) => Math.max(largest, px(getComputedStyle(heading).fontSize)), 0);
  const ruledHeadings = headings.filter((heading) => {
    const style = getComputedStyle(heading);
    if (px(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') return true;
    const before = getComputedStyle(heading, '::before');
    return before.content !== 'none' && px(before.height) > 0 && px(before.height) <= 4 && px(before.width) > 16;
  }).length;

  const paragraphs = [...document.querySelectorAll('p')].filter(visible).slice(0, 40);
  const measures = paragraphs.map((paragraph) => paragraph.getBoundingClientRect().width).filter((width) => width > 120).sort((a, b) => a - b);
  const readingMeasure = measures.length ? measures[Math.floor(measures.length / 2)] : 0;

  const bodyStyle = getComputedStyle(document.body);
  const families = (value) => String(value).split(',')[0].replace(/['"]/g, '').trim().slice(0, 40);

  const sections = [...document.querySelectorAll('main > *, body > section, main section')].filter(visible).slice(0, 30);
  const gaps = [];
  for (let index = 1; index < sections.length; index += 1) {
    const previous = sections[index - 1].getBoundingClientRect();
    const current = sections[index].getBoundingClientRect();
    const gap = current.top - previous.bottom;
    if (gap >= 0 && gap < 600) gaps.push(gap);
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const grounds = new Set(sections.map((section) => effectiveBackground(section)));

  const containers = [...document.querySelectorAll('main, main > *, body > *')].filter(visible).map((element) => element.getBoundingClientRect().width);
  const containerWidth = containers.length ? Math.max(...containers) : window.innerWidth;

  const grids = [...document.querySelectorAll('*')].filter((element) => {
    if (!visible(element)) return false;
    const style = getComputedStyle(element);
    return style.display === 'grid' && String(style.gridTemplateColumns).split(' ').filter(Boolean).length > 1;
  }).slice(0, 40);
  const asymmetric = grids.some((grid) => {
    const columns = String(getComputedStyle(grid).gridTemplateColumns).split(' ').map((value) => px(value)).filter((value) => value > 0);
    if (columns.length < 2) return false;
    return Math.max(...columns) - Math.min(...columns) > Math.max(...columns) * 0.15;
  });

  const viewportArea = window.innerWidth * Math.min(window.innerHeight, 900);
  const opening = document.querySelector('header + *, main > *:first-child, body > main, body > *:first-child');
  const openingRect = opening ? opening.getBoundingClientRect() : { top: 0, bottom: 0, width: 0 };
  const media = [...document.querySelectorAll('img, video, picture, svg')].filter(visible).filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top < Math.min(window.innerHeight, 900) && rect.width * rect.height > 4000;
  });
  const openingMediaArea = media
    .filter((element) => element.getBoundingClientRect().top <= Math.max(openingRect.bottom, window.innerHeight))
    .reduce((total, element) => {
      const rect = element.getBoundingClientRect();
      return total + Math.max(0, Math.min(rect.width, window.innerWidth)) * Math.max(0, Math.min(rect.height, window.innerHeight));
    }, 0);

  let transitions = 0;
  let animated = 0;
  for (const element of [...document.querySelectorAll('*')].slice(0, 1500)) {
    const style = getComputedStyle(element);
    if (style.transitionProperty && style.transitionProperty !== 'none' && px(style.transitionDuration) > 0) transitions += 1;
    if (style.animationName && style.animationName !== 'none') animated += 1;
  }

  const nav = document.querySelector('header nav, nav, header');
  const navStyle = nav ? getComputedStyle(nav) : null;
  const navItems = nav ? nav.querySelectorAll('a').length : 0;
  const navVisibleLinks = nav ? [...nav.querySelectorAll('a')].filter(visible).length : 0;
  const toggle = document.querySelector('button[aria-expanded], [aria-controls][role="button"], button[aria-label*="enu" i]');

  return {
    displaySize,
    bodySize: px(bodyStyle.fontSize),
    displayFamily: headings.length ? families(getComputedStyle(headings[0]).fontFamily) : families(bodyStyle.fontFamily),
    bodyFamily: families(bodyStyle.fontFamily),
    headingCount: headings.length,
    ruledHeadings,
    readingMeasure,
    medianGap,
    sectionCount: sections.length,
    grounds: grounds.size,
    backgroundLuminance: rgbLuminance(effectiveBackground(document.body)),
    containerWidth,
    gridCount: grids.length,
    asymmetric,
    heroMediaRatio: viewportArea > 0 ? Math.min(1, openingMediaArea / viewportArea) : 0,
    imageCount: document.querySelectorAll('img, picture').length,
    videoCount: document.querySelectorAll('video').length,
    transitions,
    animated,
    navPosition: navStyle ? navStyle.position : null,
    navItems,
    navVisibleLinks,
    navToggle: Boolean(toggle && visible(toggle)),
  };
}

function observation(id, measure, value, extra = {}) {
  return { id, measure, value, unit: extra.unit ?? null, viewport: extra.viewport ?? null, detail: extra.detail ?? null };
}

/**
 * Fold two viewport measurements into the observation record.
 *
 * Desktop answers most questions. Mobile exists to answer exactly two — does
 * the composition tighten, and does navigation collapse — because those are the
 * two responsive decisions the factory's own plan can act on. Measuring more
 * would produce fields nothing reads.
 */
export function observationsFrom({ desktop, mobile }) {
  const observed = { typography: [], layout: [], spacing: [], colour: [], imagery: [], motion: [], navigation: [], responsive: [] };
  observed.typography.push(
    observation('typography-display-size', 'display-font-size-px', Math.round(desktop.displaySize), { unit: 'px', viewport: 'desktop' }),
    observation('typography-body-size', 'body-font-size-px', Math.round(desktop.bodySize), { unit: 'px', viewport: 'desktop' }),
    observation('typography-display-family', 'display-font-family', desktop.displayFamily, { viewport: 'desktop' }),
    observation('typography-body-family', 'body-font-family', desktop.bodyFamily, { viewport: 'desktop' }),
    observation('typography-heading-count', 'heading-count', desktop.headingCount, { viewport: 'desktop' }),
    observation('typography-ruled-headings', 'ruled-heading-count', desktop.ruledHeadings, { viewport: 'desktop' }),
    observation('typography-measure', 'reading-measure-px', Math.round(desktop.readingMeasure), { unit: 'px', viewport: 'desktop' }),
  );
  observed.layout.push(
    observation('layout-container', 'container-max-width-px', Math.round(desktop.containerWidth), { unit: 'px', viewport: 'desktop' }),
    observation('layout-grid-count', 'grid-count', desktop.gridCount, { viewport: 'desktop' }),
    observation('layout-grid-asymmetric', 'grid-asymmetric', desktop.asymmetric, { viewport: 'desktop' }),
    observation('layout-hero-media', 'hero-media-ratio', Number(desktop.heroMediaRatio.toFixed(3)), { viewport: 'desktop' }),
  );
  observed.spacing.push(
    observation('spacing-section-gap', 'section-gap-median-px', Math.round(desktop.medianGap), { unit: 'px', viewport: 'desktop' }),
    observation('spacing-section-count', 'section-count', desktop.sectionCount, { viewport: 'desktop' }),
  );
  observed.colour.push(
    observation('colour-ground-luminance', 'background-luminance', desktop.backgroundLuminance === null ? null : Number(desktop.backgroundLuminance.toFixed(3)), { viewport: 'desktop' }),
    observation('colour-section-grounds', 'distinct-section-backgrounds', desktop.grounds, { viewport: 'desktop' }),
  );
  observed.imagery.push(
    observation('imagery-images', 'image-count', desktop.imageCount, { viewport: 'desktop' }),
    observation('imagery-video', 'video-count', desktop.videoCount, { viewport: 'desktop' }),
  );
  observed.motion.push(
    observation('motion-transitions', 'transition-declaration-count', desktop.transitions, { viewport: 'desktop' }),
    observation('motion-animated', 'animated-element-count', desktop.animated, { viewport: 'desktop' }),
  );
  observed.navigation.push(
    observation('navigation-position', 'position', desktop.navPosition, { viewport: 'desktop' }),
    observation('navigation-items', 'item-count', desktop.navItems, { viewport: 'desktop' }),
  );
  if (mobile) {
    observed.responsive.push(
      observation('responsive-mobile-gap', 'mobile-section-gap-px', Math.round(mobile.medianGap), { unit: 'px', viewport: 'mobile' }),
      observation('responsive-mobile-nav', 'mobile-navigation-collapsed', mobile.navToggle || mobile.navVisibleLinks < Math.max(2, desktop.navVisibleLinks), { viewport: 'mobile' }),
      observation('responsive-mobile-measure', 'mobile-reading-measure-px', Math.round(mobile.readingMeasure), { unit: 'px', viewport: 'mobile' }),
    );
  }
  return observed;
}

/**
 * Schemes that never leave the browser.
 *
 * A `data:` or `blob:` subresource is bytes the page already has, and `about:`
 * is the browser's own. Refusing them would break ordinary pages and would
 * refuse nothing, because none of them opens a socket. Everything else must be
 * http(s) and must be a public destination — `file:`, `ftp:` and every other
 * scheme fall through to `assertSafeReferenceUrl`, which refuses them.
 */
const NON_NETWORK_SCHEMES = Object.freeze(new Set(['data:', 'blob:', 'about:', 'javascript:']));

/**
 * The destination policy, applied to one request.
 *
 * Split out from the route handler and exported so the adversarial cases can be
 * asserted directly, resource type by resource type, without a browser. The
 * first version of this file checked only `document` requests, which left the
 * boundary open in the way that matters most: the top-level page was public, so
 * it loaded, and then anything it chose to `fetch` — an image, a script, an XHR
 * — went out from inside the factory unchecked. A trusted browser that will
 * fetch `http://169.254.169.254/` on a page's instruction is an internal-network
 * fetcher with a screenshot feature, whatever its navigation policy says.
 *
 * `cache` is per capture and keyed by host, so a page with fifty subresources
 * across five origins costs five resolutions rather than fifty. A verdict is
 * never cached across captures.
 */
export async function referenceRequestVerdict(requestUrl, { lookup = dns.lookup, hostAddresses = [], cache = null } = {}) {
  let parsed;
  try {
    parsed = new URL(String(requestUrl));
  } catch {
    // Unparseable is refused, not waved through. This is the fail-closed edge.
    return { allowed: false, reason: 'unparseable', host: null };
  }
  if (NON_NETWORK_SCHEMES.has(parsed.protocol)) return { allowed: true, reason: 'non-network-scheme', host: null };

  const host = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  const key = `${parsed.protocol}//${host}`;
  if (cache?.has(key)) return cache.get(key);

  let verdict;
  try {
    await assertSafeReferenceUrl(parsed.href, { lookup, hostAddresses });
    verdict = { allowed: true, reason: 'public', host };
  } catch (error) {
    verdict = { allowed: false, reason: error instanceof Error ? error.message : String(error), host };
  }
  cache?.set(key, verdict);
  return verdict;
}

/**
 * Route every request through the policy, and record what was turned away.
 *
 * Recording matters: a refusal nobody can see is a refusal nobody can test, and
 * a reference page that tried to reach an internal address is something a
 * reviewer should be told about rather than something that silently failed to
 * load.
 */
export function guardReferenceRequests(context, { lookup = dns.lookup, hostAddresses = [], blocked = [] } = {}) {
  const cache = new Map();
  return context.route('**/*', async (route, request) => {
    const verdict = await referenceRequestVerdict(request.url(), { lookup, hostAddresses, cache });
    if (verdict.allowed) return route.continue();
    const entry = { host: verdict.host, resourceType: request.resourceType(), reason: verdict.reason };
    // Deduplicated: one page can attempt the same forbidden host hundreds of
    // times, and a hundred identical lines is not a hundred findings.
    if (!blocked.some((seen) => seen.host === entry.host && seen.resourceType === entry.resourceType)) blocked.push(entry);
    return route.abort('blockedbyclient');
  });
}

async function chromium() {
  const playwright = await import('@playwright/test');
  return playwright.chromium;
}

function launchOptions(env) {
  const executablePath = env.APP_BUILDER_BROWSER_EXECUTABLE;
  return executablePath ? { executablePath } : {};
}

/**
 * Capture one reference URL at two widths.
 *
 * Every navigation the page performs is re-classified, so a public URL that
 * 302s to `http://localhost:4310/projects` is refused at the hop rather than
 * photographed. Playwright's own request interception is the right place for
 * that: it sees the destination the browser is actually about to load.
 *
 * A host with no browser is not a failure of the feature. `status: unavailable`
 * comes back with the reason, the caller keeps whatever the person said, and
 * the analysis records `createdFromEvidence: false` rather than pretending.
 */
export async function captureReference(requestedUrl, {
  launch = null,
  env = process.env,
  lookup = dns.lookup,
  hostAddresses = [],
  now = () => new Date().toISOString(),
} = {}) {
  const url = await assertSafeReferenceUrl(requestedUrl, { lookup, hostAddresses });
  if (!launch) {
    const status = await evidenceBrowserStatus({ env });
    if (!status.ready) {
      return { status: 'unavailable', capturedAt: now(), unavailableReason: describeEvidenceBrowser(status), canonicalUrl: null, viewports: [], observed: null, screenshots: [], blockedRequests: [] };
    }
  }

  const browser = await (launch ? launch() : (await chromium()).launch(launchOptions(env)));
  const measurements = {};
  const screenshots = [];
  const viewports = [];
  const blocked = [];
  let canonicalUrl = url.href;
  try {
    for (const viewport of REFERENCE_VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        // Motion is measured from computed styles rather than photographed, so
        // reducing it costs no observation and makes the picture reproducible.
        reducedMotion: 'reduce',
        javaScriptEnabled: true,
        // A service worker's own requests do not reach `context.route`, which
        // would make it the one way a page could still fetch what it likes.
        // Nothing measured here needs one, so the answer is to refuse them
        // rather than to build a second filter for a second request path.
        serviceWorkers: 'block',
      });
      // Every request, every hop. A redirect is a destination and so is an
      // image: the boundary is about where the browser connects, not about
      // which kind of request asked it to.
      await guardReferenceRequests(context, { lookup, hostAddresses, blocked });
      const page = await context.newPage();
      // WebSockets are not covered by `context.route`, and a capture has no use
      // for one. Refusing them closes the channel rather than leaving a second
      // destination policy to keep true. Deliberately not guarded against a
      // browser that cannot do this: silently losing a boundary because an API
      // was missing is the failure this whole change exists to close.
      await page.routeWebSocket('**/*', (ws) => {
        if (!blocked.some((seen) => seen.resourceType === 'websocket')) blocked.push({ host: null, resourceType: 'websocket', reason: 'websockets are refused during reference capture' });
        ws.close();
      });
      try {
        const response = await page.goto(url.href, { waitUntil: 'load', timeout: CAPTURE_TIMEOUT_MS });
        if (!response) throw new Error(`The browser loaded nothing from ${url.href}.`);
        // The URL that was finally loaded is the one that was observed, and it
        // is re-checked here because a client-side navigation is not a request
        // the route handler saw as a document.
        canonicalUrl = (await assertSafeReferenceUrl(page.url(), { lookup, hostAddresses })).href;
        await page.waitForTimeout(600);
        const bytes = await page.screenshot({ fullPage: viewport.name === 'desktop', animations: 'disabled', type: 'png' });
        measurements[viewport.name] = await page.evaluate(measurePage);
        screenshots.push({ viewport: viewport.name, bytes });
        viewports.push({
          name: viewport.name,
          width: viewport.width,
          height: viewport.height,
          file: `${viewport.name}.png`,
          contentHash: createHash('sha256').update(bytes).digest('hex'),
          byteSize: bytes.length,
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return {
    status: 'captured',
    capturedAt: now(),
    unavailableReason: null,
    canonicalUrl,
    viewports,
    screenshots,
    blockedRequests: blocked,
    observed: observationsFrom({ desktop: measurements.desktop, mobile: measurements.mobile ?? null }),
  };
}
