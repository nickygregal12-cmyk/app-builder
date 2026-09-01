/**
 * Capture interaction states.
 *
 * Prototype A lost half a point on interaction-craft because a reviewer was shown static pages
 * and correctly refused to guess at hover, focus and transition behaviour. Prototype B answered
 * that with thirteen driven states and scored 9. This does the same, for the interactions this
 * site actually has — which are mostly about colour changing under the cursor and under the
 * keyboard.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4371';
const OUT = process.argv[2] ?? 'evidence/states';
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { name: 'skip-link-focus', route: '/', width: 1440, height: 260,
    what: 'the skip link, revealed by the first Tab press',
    act: async (p) => { await p.keyboard.press('Tab'); await p.waitForTimeout(400); } },

  { name: 'nav-hover', route: '/', width: 1440, height: 200,
    what: 'a navigation link under the cursor, its rule drawn in — on a painted masthead, so the rule takes the ground’s computed ink',
    act: async (p) => { await p.hover('.nav a:nth-child(3)'); await p.waitForTimeout(450); } },

  { name: 'nav-focus-keyboard', route: '/paints', width: 1440, height: 220,
    what: 'the navigation reached by keyboard: the focus ring is the ink plus a ground-coloured gap, so it reads on all thirty-six grounds',
    act: async (p) => { for (let i = 0; i < 3; i += 1) await p.keyboard.press('Tab'); await p.waitForTimeout(350); } },

  { name: 'lightbox-choice', route: '/', width: 1440, height: 980, anchor: '#light',
    what: 'the light box after choosing Venetian: all four panels repainted by the same transform that rendered them on the server',
    act: async (p) => { await p.click('.sw[data-pick="venetian"]'); await p.waitForTimeout(700); } },

  { name: 'lightbox-keyboard', route: '/', width: 1440, height: 980, anchor: '#light',
    what: 'the same control driven by the arrow keys — a radiogroup with roving tabindex, focus ring on the chosen swatch',
    act: async (p) => {
      await p.click('.sw[data-pick="gold-ochre"]');
      await p.focus('.sw[data-pick="gold-ochre"]');
      await p.keyboard.press('ArrowRight');
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(700);
    } },

  { name: 'lightbox-mid-transition', route: '/', width: 1440, height: 980, anchor: '#light', reducedMotion: 'no-preference',
    what: 'a frame taken 120ms into the 420ms repaint between two colours — the panels caught between states rather than settled',
    act: async (p) => {
      await p.click('.sw[data-pick="ropewalk"]');
      await p.waitForTimeout(600);
      await p.click('.sw[data-pick="peat"]');
      await p.waitForTimeout(120);
    } },

  { name: 'reduced-motion-same-choice', route: '/', width: 1440, height: 980, anchor: '#light', reducedMotion: 'reduce',
    what: 'prefers-reduced-motion: reduce — the same choice, arriving at the identical state with the repaint suppressed',
    act: async (p) => { await p.click('.sw[data-pick="peat"]'); await p.waitForTimeout(400); } },

  { name: 'swatch-hover', route: '/', width: 1440, height: 760,
    what: 'a swatch under the cursor: an inset rule in the swatch’s own computed ink, so the affordance works on a lime white and on a lamp black',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.swatches')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(300);
      await p.hover('.swatch:nth-child(15)');
      await p.waitForTimeout(500);
    } },

  { name: 'index-chip-hover', route: '/colours', width: 1440, height: 700,
    what: 'a colour chip in the index scaling under the cursor',
    act: async (p) => {
      await p.evaluate(() => document.querySelectorAll('.idx__chip')[4]?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(300);
      await p.hover('.idx__chip >> nth=4');
      await p.waitForTimeout(500);
    } },

  { name: 'calculator-focus', route: '/samples', width: 1440, height: 900,
    what: 'the coverage calculator with a field focused and a value changed: the results recompute from the stored coverage figures',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('[data-calc]')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(300);
      await p.fill('#w', '6.5');
      await p.focus('#h');
      await p.waitForTimeout(500);
    } },

  { name: 'pager-hover', route: '/colours/oxblood', width: 1440, height: 400,
    what: 'the next-colour link, its chip scaling to preview where it goes',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.pager')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(300);
      await p.hover('.pager__r');
      await p.waitForTimeout(500);
    } },

  { name: 'mobile-lightbox-2x2', route: '/', width: 390, height: 844, reducedMotion: 'no-preference',
    what: 'phone: the light box stays two by two rather than stacking, because the artefact exists to be compared and a single column would be the same failure as the printed card',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.lb__grid')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(500);
    } },

  { name: 'mobile-swatch-grid', route: '/', width: 390, height: 844,
    what: 'phone: the catalogue holds three across and squares up, so neighbouring colours can still be judged against each other',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.swatches')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(400);
    } },

  { name: 'mobile-matrix-records', route: '/walls', width: 390, height: 844,
    what: 'phone: the substrate matrix becomes eight records each listing its four verdicts, rather than four columns of two-word lines',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.mtx tbody tr:nth-child(7)')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(400);
    } },
  { name: 'filter-greens', route: '/colours', width: 1440, height: 900,
    what: 'the catalogue filtered to green earths — six of thirty-six, with the count announced and the other five families withdrawn rather than greyed',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.filters')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
      await p.click('[data-filter-family="green"]');
      await p.waitForTimeout(450);
    } },

  { name: 'filter-two-axes', route: '/colours', width: 1440, height: 900,
    what: 'both filters at once: earth reds under 20 light reflectance. The two questions people arrive with, answered together',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.filters')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
      await p.click('[data-filter-family="red"]');
      await p.click('[data-filter-lrv="dark"]');
      await p.waitForTimeout(450);
    } },

  { name: 'sample-added', route: '/colours', width: 1440, height: 760,
    what: 'two colours added to the sample box: the control flips to a checked state and the masthead count follows, from a different part of the page',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.idx__fam')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
      await p.locator('.add:visible').nth(0).click();
      await p.locator('.add:visible').nth(2).click();
      await p.waitForTimeout(400);
    } },

  { name: 'sample-box-full', route: '/samples', width: 1440, height: 900,
    what: 'the box holding its four, each with its pigment, and the total. Server-rendered empty and filled from storage, so the empty state is real rather than hypothetical',
    act: async (p) => {
      await p.evaluate(() => {
        localStorage.setItem('marlpit.box', JSON.stringify(['ropewalk', 'sage-earth', 'oxblood', 'slate']));
      });
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(500);
      await p.evaluate(() => document.querySelector('#box')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(300);
    } },

  { name: 'sample-box-blocked', route: '/colours', width: 1440, height: 760,
    what: 'the box already full: every unchosen control is dimmed and refuses, and the live region says why rather than the click doing nothing',
    act: async (p) => {
      await p.evaluate(() => {
        localStorage.setItem('marlpit.box', JSON.stringify(['ropewalk', 'sage-earth', 'oxblood', 'slate']));
      });
      await p.reload({ waitUntil: 'load' });
      await p.waitForTimeout(400);
      await p.evaluate(() => document.querySelector('.idx__fam')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(300);
    } },
];

const browser = await chromium.launch();
const index = [];
for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1,
    reducedMotion: shot.reducedMotion ?? 'no-preference',
  });
  const page = await context.newPage();
  await page.goto(BASE + shot.route, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  if (shot.anchor) {
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), shot.anchor);
    await page.waitForTimeout(250);
  }
  await shot.act(page);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  index.push({ file: `${shot.name}.png`, route: shot.route, viewport: shot.width <= 500 ? 'mobile' : 'desktop', state: shot.what });
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/index.json`, `${JSON.stringify(index, null, 1)}\n`);
console.log(`${index.length} interaction states captured into ${OUT}`);
