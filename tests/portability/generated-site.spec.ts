import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

/**
 * Targeted cross-engine portability, not a second copy of the suite.
 *
 * `docs/VISUAL_EXCELLENCE.md` §9 carries this as an outstanding row for a
 * reason worth restating: a layout that breaks in Safari is exactly the defect
 * a corpus is supposed to catch, and catching it once per project is the
 * expensive way. So this lane is bounded on purpose — two routes, the states
 * that differ, and assertions about defects rather than pixel baselines.
 *
 * Pixel baselines across engines are noise: three browsers rasterise text
 * differently and a diff that always fails teaches nobody anything. Every check
 * below is a measurement with a defect behind it that a real engine actually
 * exhibits.
 *
 * Full RenderedEvidence stays on the primary browser. What this lane records is
 * the measurements and one capture per route per engine, which is what makes a
 * disagreement between engines legible after the run.
 */

const EVIDENCE = '.app-builder/portability';

// Two routes, chosen because they are the two whose failures differ by engine:
// the home page carries the sticky header, the viewport-unit frame and the
// responsive imagery; the contact page carries the form controls.
const ROUTES = ['/', '/contact'] as const;

type Measurement = Record<string, unknown>;

function record(testInfo: TestInfo, route: string, name: string, value: Measurement) {
  const dir = path.join(EVIDENCE, testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'measurements.json');
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { schemaVersion: 1, project: testInfo.project.name, measurements: [] };
  existing.measurements = existing.measurements.filter((entry: Measurement) => !(entry.route === route && entry.check === name));
  existing.measurements.push({ route, check: name, ...value });
  existing.measurements.sort((a: Measurement, b: Measurement) => `${a.route}${a.check}`.localeCompare(`${b.route}${b.check}`));
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
}

async function capture(page: Page, testInfo: TestInfo, route: string) {
  const dir = path.join(EVIDENCE, testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

for (const route of ROUTES) {
  test.describe(route, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    });

    /**
     * `100vw` is not the width of the space a document has. Where a classic
     * scrollbar is laid out inside the viewport, `100vw` includes it, and a
     * gutter computed from `calc((100vw - max-width) / 2)` — which the shared
     * header does — pushes the page wider than the window. The page then
     * scrolls sideways on one engine and not another.
     */
    test('nothing makes the page scroll sideways', async ({ page }, testInfo) => {
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const limit = doc.clientWidth;
        const offenders: Array<{ selector: string; right: number; width: number }> = [];
        for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.right <= limit + 1 && box.left >= -1) continue;
          const selector = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`;
          offenders.push({ selector, right: Math.round(box.right), width: Math.round(box.width) });
        }
        return { viewportWidth: limit, scrollWidth: doc.scrollWidth, offenders: offenders.slice(0, 5) };
      });
      record(testInfo, route, 'horizontal-overflow', overflow);
      expect(overflow.offenders, `elements extend past the viewport: ${JSON.stringify(overflow.offenders)}`).toEqual([]);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    });

    /**
     * A sticky header inside a flex column, over a backdrop filter. Both parts
     * have engine-specific failures: the sticky containing block is decided by
     * the nearest scroll container, and a filtered backdrop creates one in some
     * engines and not others, so the header scrolls away on exactly one browser.
     */
    test('the header stays where it was told to stay', async ({ page }, testInfo) => {
      const header = page.locator('.site-header');
      await expect(header).toBeVisible();
      const before = await header.boundingBox();
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForFunction(() => window.scrollY > 0 || document.documentElement.scrollHeight <= window.innerHeight);
      const scrolled = await page.evaluate(() => window.scrollY);
      const after = await header.boundingBox();
      record(testInfo, route, 'sticky-header', { scrolledBy: scrolled, topBefore: before?.y ?? null, topAfter: after?.y ?? null });
      if (scrolled === 0) test.skip(true, 'the page is shorter than the viewport on this device, so there is nothing to stick to');
      expect(after, 'the header stopped being laid out after scrolling').not.toBeNull();
      expect(Math.abs(after!.y), `the header scrolled away with the page (top ${after!.y})`).toBeLessThanOrEqual(2);
      await expect(header).toBeInViewport();
    });

    /**
     * `100vh` is the largest the viewport gets, not the size it currently is.
     * On a mobile browser with a retracting address bar, a `min-height: 100vh`
     * frame is taller than the space the visitor can see, and the footer sits
     * below the fold on a page with nothing in it.
     */
    test('a full-height frame is the height of the viewport a visitor actually has', async ({ page }, testInfo) => {
      const frame = await page.evaluate(() => {
        const element = document.querySelector<HTMLElement>('.site-frame');
        if (!element) return null;
        return {
          minHeight: getComputedStyle(element).minHeight,
          innerHeight: window.innerHeight,
          visualViewport: window.visualViewport ? Math.round(window.visualViewport.height) : null,
        };
      });
      record(testInfo, route, 'viewport-units', frame ?? { missing: true });
      expect(frame, 'the shared frame is missing, so the viewport-unit question cannot be asked').not.toBeNull();
      const resolved = Number.parseFloat(frame!.minHeight);
      expect(Number.isFinite(resolved), `min-height resolved to ${frame!.minHeight}`).toBe(true);
      // One device pixel of rounding is tolerated; an address bar is tens of pixels.
      expect(Math.abs(resolved - frame!.innerHeight), `a ${resolved}px frame in a ${frame!.innerHeight}px viewport puts the page bottom out of reach`).toBeLessThanOrEqual(1.5);
    });

    /**
     * `aspect-ratio` with `object-fit: cover` is how every image in the shared
     * presentation keeps its box. An engine that ignores either renders the
     * image at its natural ratio and moves everything below it.
     */
    test('responsive imagery keeps its box and its crop', async ({ page }, testInfo) => {
      const images = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('img')).map((image) => {
        const box = image.getBoundingClientRect();
        const parent = image.parentElement?.getBoundingClientRect();
        const style = getComputedStyle(image);
        return {
          src: image.currentSrc || image.src,
          loaded: image.complete && image.naturalWidth > 0,
          objectFit: style.objectFit,
          width: Math.round(box.width),
          height: Math.round(box.height),
          overflowsParent: parent ? box.width > parent.width + 1 : false,
        };
      }));
      record(testInfo, route, 'responsive-imagery', { count: images.length, images });
      for (const image of images) {
        expect(image.loaded, `${image.src} did not load`).toBe(true);
        expect(image.overflowsParent, `${image.src} is wider than the box it was given`).toBe(false);
        expect(image.objectFit, `${image.src} lost its object-fit`).not.toBe('fill');
      }
    });

    /**
     * The one capture per route per engine. Not a baseline to diff — a picture
     * to look at when two engines disagree about a measurement above.
     */
    test('portability capture', async ({ page }, testInfo) => {
      await capture(page, testInfo, route);
    });
  });
}

test.describe('/contact', () => {
  /**
   * Mobile Safari zooms the page when a focused control's font is under 16px,
   * and never zooms back out. It is the single most common "the form is broken
   * on iPhone" report, and it is invisible in Chromium.
   */
  test('a form control does not zoom the page when it is focused', async ({ page }, testInfo) => {
    await page.goto('/contact');
    const controls = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('input, select, textarea'))
      // A hidden field is not a touch target and has no font a visitor can be
      // zoomed by. The lead-generation recipe posts one, so excluding it is
      // reading the page rather than relaxing the rule.
      .filter((control) => !(control instanceof HTMLInputElement && control.type === 'hidden'))
      .filter((control) => control.getBoundingClientRect().width > 0)
      .map((control) => {
        const style = getComputedStyle(control);
        const box = control.getBoundingClientRect();
        return {
          name: control.getAttribute('name') ?? control.tagName.toLowerCase(),
          fontSize: Number.parseFloat(style.fontSize),
          height: Math.round(box.height),
          width: Math.round(box.width),
        };
      }));
    record(testInfo, '/contact', 'form-controls', { count: controls.length, controls });
    expect(controls.length, 'the contact page has no form controls to check').toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.fontSize, `${control.name} is ${control.fontSize}px, so focusing it zooms the page on iOS`).toBeGreaterThanOrEqual(16);
      expect(control.height, `${control.name} is ${control.height}px tall, below a comfortable touch target`).toBeGreaterThanOrEqual(40);
    }
  });
});

test.describe('reduced motion', () => {
  /**
   * The MotionContract's reduced-motion behaviour, asked of every engine rather
   * than of the one the tokens were written in. A transition that survives the
   * media query is a contract that is only honoured where it was tested.
   */
  test('a visitor who asked for less motion gets none', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const moving = await page.evaluate(() => {
      const seconds = (value: string) => value.split(',').map((part) => {
        const trimmed = part.trim();
        return trimmed.endsWith('ms') ? Number.parseFloat(trimmed) / 1000 : Number.parseFloat(trimmed);
      }).reduce((max, current) => (Number.isFinite(current) && current > max ? current : max), 0);
      return Array.from(document.body.querySelectorAll<HTMLElement>('*')).map((element) => {
        const style = getComputedStyle(element);
        return { tag: element.tagName.toLowerCase(), transition: seconds(style.transitionDuration), animation: seconds(style.animationDuration) };
      }).filter((entry) => entry.transition > 0.01 || entry.animation > 0.01).slice(0, 5);
    });
    record(testInfo, '/', 'reduced-motion', { offenders: moving });
    expect(moving, `these still animate for a visitor who asked for reduced motion: ${JSON.stringify(moving)}`).toEqual([]);
  });
});

test.describe('mobile composition', () => {
  /**
   * The mobile-Safari-shaped composition question, which is a real one for this
   * factory: the ResponsiveCompositionPlan says navigation becomes a
   * disclosure, and the toggle is revealed by a script. An engine where the
   * script's feature detection differs gets four rows of wrapped pills instead.
   */
  test('navigation is a disclosure on a phone, and it opens', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'this is the phone composition, asked on the phone projects');
    await page.goto('/');
    const toggle = page.locator('.site-header .nav-toggle');
    const nav = page.locator('#primary-navigation');
    await expect(toggle).toBeVisible();
    await expect(nav).toHaveAttribute('data-open', 'false');
    await toggle.click();
    await expect(nav).toHaveAttribute('data-open', 'true');
    await expect(nav.locator('a').first()).toBeVisible();
    record(testInfo, '/', 'mobile-navigation', { disclosure: true, opens: true });
    await capture(page, testInfo, '/mobile-nav-open');
  });
});
