/**
 * Capture interaction states.
 *
 * Run with tsx, because the shut-state capture needs the tidal model rather than a hardcoded
 * timestamp: the header strip reports whether the causeway is passable *now*, so showing it in
 * both states means finding a moment the model actually calls shut and freezing the page clock
 * there. Picking a plausible-looking date by hand would be inventing the one number on this site
 * that is supposed to be computed.
 *
 * Everything else is the ordinary set — hover and keyboard for each control, the sort actually
 * sorting, and the two recompositions that are the argument for the responsive work rather than
 * an illustration of it.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { hoursSince, isOpen } from './src/lib/tide.ts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4333';
const OUT = process.argv[2] ?? 'evidence/states';
fs.mkdirSync(OUT, { recursive: true });

/** The first moment in the next fortnight the model says the road is under water. */
const shutAt = (() => {
  const start = Date.now();
  for (let step = 0; step < 14 * 24 * 6; step += 1) {
    const when = start + step * 10 * 60_000;
    if (!isOpen(hoursSince(new Date(when)))) return when;
  }
  throw new Error('the model never shuts the road, which would be a bug in the model');
})();

/** The first moment after that when it opens again, for the pair. */
const openAt = (() => {
  for (let step = 0; step < 14 * 24 * 6; step += 1) {
    const when = shutAt + step * 10 * 60_000;
    if (isOpen(hoursSince(new Date(when)))) return when;
  }
  throw new Error('the model never opens the road');
})();

/** Freeze the page clock. The header is the only thing on the site that reads it. */
const freeze = (at) => (page) =>
  page.addInitScript((ms) => {
    const Real = Date;
    class Frozen extends Real {
      constructor(...args) { super(...(args.length ? args : [ms])); }
      static now() { return ms; }
    }
    globalThis.Date = Frozen;
  }, at);

const shots = [
  { name: 'status-open', route: '/', width: 1440, height: 190, before: freeze(openAt),
    what: 'the header strip with the road open: the water is back over it at the stated time, counted down live. The state marker is empty because nothing is over the road',
    act: async (p) => { await p.waitForTimeout(400); } },

  { name: 'status-shut', route: '/', width: 1440, height: 190, before: freeze(shutAt),
    what: 'the same strip with the causeway shut — the depth over the road, when it opens, and how long that is. The marker takes the ochre, which is the only thing on this site that colour ever means',
    act: async (p) => { await p.waitForTimeout(400); } },

  { name: 'skip-link-focus', route: '/', width: 1440, height: 220,
    what: 'the skip link, revealed by the first Tab press',
    act: async (p) => { await p.keyboard.press('Tab'); await p.waitForTimeout(350); } },

  { name: 'nav-hover', route: '/weeks', width: 1440, height: 200,
    what: 'a navigation item under the cursor. The current section is underscored in ink and hover raises a lighter rule, so the two are not confusable',
    act: async (p) => { await p.hover('.hd__a[href="/house"]'); await p.waitForTimeout(400); } },

  { name: 'nav-focus-keyboard', route: '/crossing', width: 1440, height: 220,
    what: 'navigation reached by keyboard: a two-pixel ink bracket, offset, on the same element hover only underlines',
    act: async (p) => { for (let i = 0; i < 3; i += 1) await p.keyboard.press('Tab'); await p.waitForTimeout(350); } },

  { name: 'ribbon-crossing-tooltip', route: '/crossing', width: 1440, height: 560,
    what: 'a single crossing of the day ribbon under the cursor. Every bar carries its own times and duration, so the chart can be interrogated rather than only read',
    act: async (p) => {
      await p.evaluate(() => document.querySelectorAll('.rib')[0]?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(250);
      await p.hover('.rib--day .rib__open:nth-of-type(2)');
      await p.waitForTimeout(600);
    } },

  { name: 'week-card-hover', route: '/', width: 1440, height: 720,
    what: 'one of the three week cards under the cursor: the ground shifts a step and the label goes to full ink',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.cards')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(250);
      await p.hover('.cards li:nth-child(2) .card__a');
      await p.waitForTimeout(450);
    } },

  { name: 'week-row-hover', route: '/weeks', width: 1440, height: 620,
    what: 'a row of the season list under the cursor, showing that the whole row is the target and not just the date',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.wk')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
      await p.hover('.wk__r:nth-child(4) .wk__a');
      await p.waitForTimeout(450);
    } },

  { name: 'sort-default', route: '/weeks', width: 1440, height: 700,
    what: 'the season list in its default order, by date. Thirty weeks, thirty different tides, and the ribbon is what differs between the rows',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.sortbar')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(300);
    } },

  { name: 'sort-least-cut-off', route: '/weeks', width: 1440, height: 700,
    what: 'the same thirty rows re-ordered by hours cut off. Nothing was fetched and nothing is hidden — the rows were already in the document, which is why it also works with find-in-page',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.sortbar')?.scrollIntoView({ block: 'start' }));
      await p.click('[data-sort="shut"]');
      await p.waitForTimeout(500);
      await p.evaluate(() => document.querySelector('.sortbar')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
    } },

  { name: 'sort-focus-keyboard', route: '/weeks', width: 1440, height: 260,
    what: 'the sort control reached by keyboard, with the pressed button carrying aria-pressed and the ink fill rather than colour alone',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.sortbar')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(200);
      await p.focus('[data-sort="price"]');
      await p.waitForTimeout(350);
    } },

  { name: 'prose-link-hover', route: '/before-you-book', width: 1440, height: 480,
    what: 'a link in prose under the cursor: the underline goes from rule to ink. Links are never given the ochre, because the ochre means water over the road and nothing else',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.prose a')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(250);
      await p.hover('.prose a');
      await p.waitForTimeout(400);
    } },

  { name: 'pager-hover', route: '/weeks/2026-08-21', width: 1440, height: 300,
    what: 'the next-week link under the cursor, showing its price and tide before the click',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.pager')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(250);
      await p.hover('.pager__a--r');
      await p.waitForTimeout(400);
    } },

  { name: 'sort-feedback', route: '/weeks', width: 1440, height: 300,
    what: 'the status line after a sort. It is a live region and it is also just visible text, so the feedback reaches everybody rather than only a screen reader — and it says what happened to the month headings',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.sortbar')?.scrollIntoView({ block: 'start' }));
      await p.click('[data-sort="price"]');
      await p.waitForTimeout(500);
      await p.evaluate(() => document.querySelector('.sortbar')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(250);
    } },

  { name: 'recompose-inventory-mobile', route: '/enquire', width: 390, height: 900,
    what: 'the availability inventory on a phone. As a seven-column table in a scrolling box it put price and status — the two columns anybody scanning availability wants — off the right-hand edge; each row is now a labelled block with the status beside the date',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.av')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(350);
    } },

  { name: 'enquire-action-hover', route: '/weeks/2026-04-03', width: 1440, height: 420,
    what: 'the enquiry action on a week that is open, under the cursor. A week that has gone gets a quieter outlined control asking about cancellations instead, because offering the same button either way makes the reader fill in a form to discover the answer',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.act')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(250);
      await p.hover('.act__b');
      await p.waitForTimeout(400);
    } },

  { name: 'recompose-week-row-mobile', route: '/weeks', width: 390, height: 900,
    what: 'the season row recomposed for a phone. The ribbon does not shrink into the row — it takes the full width underneath it, because it is the densest thing in the row and at 8rem it would be a texture rather than a chart',
    act: async (p) => {
      await p.evaluate(() => document.querySelector('.wk')?.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(300);
    } },

  { name: 'recompose-crossing-mobile', route: '/crossing', width: 390, height: 900,
    what: 'the day ribbon at 390px. The label column narrows and the hour axis stays, because a timeline without its hours is a decoration',
    act: async (p) => {
      await p.evaluate(() => document.querySelectorAll('.rib')[0]?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(300);
    } },
];

const browser = await chromium.launch();
const manifest = [];
for (const shot of shots) {
  const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (shot.before) await shot.before(page);
  await page.goto(BASE + shot.route, { waitUntil: 'networkidle' });
  await shot.act(page);
  const file = `${shot.name}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  // The shape ../tools/packet.mjs reads: file, route, the state being held, and the viewport
  // class rather than the pixel size. Writing it as `what` instead of `state` dropped fourteen
  // of fifteen states from the packet without an error — the reviewer would have scored
  // interaction-craft on one screenshot and been right to mark it down.
  manifest.push({
    file,
    route: shot.route,
    state: shot.what,
    viewport: shot.width <= 500 ? 'mobile' : 'desktop',
  });
  console.log('ok', shot.name);
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/index.json`, `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${manifest.length} states -> ${OUT}`);
console.log(`shut state frozen at ${new Date(shutAt).toISOString()}, open at ${new Date(openAt).toISOString()}`);
