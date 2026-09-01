/**
 * Capture interaction states.
 *
 * This site has fewer interactions than the three before it and that is a property of the
 * domain: a report is read rather than operated. The ones it does have are load-bearing — the
 * grid readout is how 720 cells become legible, and the data filter is how 720 rows do — so they
 * are captured under pointer and keyboard both, and the mobile recompositions are captured
 * because they are the argument for the responsive work rather than an illustration of it.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4381';
const OUT = process.argv[2] ?? 'evidence/states';
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { name: 'skip-link-focus', route: '/', width: 1440, height: 240,
    what: 'the skip link, revealed by the first Tab press',
    act: async (p) => { await p.keyboard.press('Tab'); await p.waitForTimeout(400); } },

  { name: 'nav-hover', route: '/', width: 1440, height: 200,
    what: 'a contents link under the cursor. The current chapter is marked with the spot colour; hover uses ink, so the two states are not confusable',
    act: async (p) => { await p.hover('.head__nav a:nth-child(3)'); await p.waitForTimeout(450); } },

  { name: 'nav-focus-keyboard', route: '/findings', width: 1440, height: 260,
    what: 'the contents reached by keyboard: a bracket in the spot colour, which appears nowhere else as an interface element',
    act: async (p) => { for (let i = 0; i < 3; i += 1) await p.keyboard.press('Tab'); await p.waitForTimeout(350); } },

  { name: 'grid-cell-hover', route: '/', width: 1440, height: 620, anchor: '#coverage',
    what: 'a cell of the coverage grid under the cursor — Elverley in a month where 21% of its estate was reporting — with the readout showing coverage, what would be published and what the simulation says happened',
    act: async (p) => {
      await p.hover('tbody tr:nth-child(5) .cg__cell:nth-child(20)');
      await p.waitForTimeout(450);
    } },

  { name: 'grid-cell-keyboard', route: '/', width: 1440, height: 620, anchor: '#coverage',
    what: 'the same grid reached by keyboard: every cell is a button, so the 720-cell figure is traversable rather than pointer-only, and the readout follows focus as well as hover',
    act: async (p) => {
      await p.focus('tbody tr:nth-child(2) .cg__cell:nth-child(31)');
      await p.keyboard.press('Tab');
      await p.keyboard.press('Tab');
      await p.waitForTimeout(450);
    } },

  { name: 'data-filter', route: '/data', width: 1440, height: 900,
    what: 'the data chapter filtered to one catchment: 720 rows to 60, with the count announced',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.filter')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
      await p.click('[data-f="elverley"]');
      await p.waitForTimeout(450);
    } },

  { name: 'table-row-hover', route: '/catchments', width: 1440, height: 700,
    what: 'a row of the catchment table under the cursor, and the sparkline that runs in its last column',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.cat')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(250);
      await p.hover('.cat tbody tr:nth-child(3)');
      await p.waitForTimeout(400);
    } },

  { name: 'figure-link-hover', route: '/findings', width: 1440, height: 640,
    what: 'a cross-reference in the margin under the cursor: findings point back at the figure they rest on',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('#f2')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
      await p.hover('#f2 .margin a');
      await p.waitForTimeout(400);
    } },

  { name: 'mobile-grid-annual', route: '/', width: 390, height: 844,
    what: 'phone: the coverage figure becomes five annual columns with the percentage printed in each, not sixty monthly ones scaled down or panned. A different aggregation, chosen because the comparison is the point and a reader must be able to see two catchments at once',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('#coverage')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(450);
    } },

  { name: 'mobile-margin-folded', route: '/', width: 390, height: 844,
    what: 'phone: the margin folds under the reading column as an endnote block rather than narrowing to a strip of two-word lines',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.margin')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(400);
    } },

  { name: 'mobile-catchment-records', route: '/catchments', width: 390, height: 844,
    what: 'phone: the seven-column catchment table becomes twelve records, each keeping its sparkline full width',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.cat')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(400);
    } },

  { name: 'reduced-motion', route: '/', width: 1440, height: 620, anchor: '#coverage', reducedMotion: 'reduce',
    what: 'prefers-reduced-motion: reduce — the same grid hover, arriving at the identical state with the outline transition suppressed',
    act: async (p) => {
      await p.hover('tbody tr:nth-child(5) .cg__cell:nth-child(20)');
      await p.waitForTimeout(400);
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
