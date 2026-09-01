import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://127.0.0.1:4331';
const OUT = process.argv[2] ?? 'evidence/v1';
const VIEWPORTS = [
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];
const PAGES = process.env.PAGES ? process.env.PAGES.split(',') : ['/', '/work', '/work/ashcombe-barn', '/studio', '/contact'];
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${vp.name} console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${vp.name} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`${vp.name} requestfailed: ${r.url()}`));
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    // Scroll the whole page so lazy frames enter the viewport and decode. A full-page
    // screenshot does not trigger lazy loading on its own, and a sheet of blur placeholders
    // would have me critiquing the loading strategy instead of the design.
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
      await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => i.decode().catch(() => {})));
      await new Promise((r) => setTimeout(r, 250));
    });
    // Horizontal overflow is the single most common responsive defect and it is invisible
    // in a full-page screenshot that has already been widened to fit it.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push(`${vp.name} ${path}: horizontal overflow ${overflow}px`);
    const slug = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-');
    await page.screenshot({ path: `${OUT}/${slug}--${vp.name}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/problems.json`, JSON.stringify(problems, null, 1) + '\n');
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'No console errors, failed requests or horizontal overflow.');
