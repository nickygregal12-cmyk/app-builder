#!/usr/bin/env node
/**
 * Find architectural photography on Wikimedia Commons and record where every frame came from.
 *
 * A fictional practice has no photographs, and the buildings in these frames are real works by
 * other architects. That is a constraint on the *fiction* rather than on the design: the
 * practice is written as one that works on buildings it did not originally design, so a credit
 * naming the photographer is the site's own editorial voice instead of an apology bolted to
 * the footer. Provenance is recorded per frame and restated in ASSETS.md.
 *
 * Only licences permitting commercial reuse with attribution are kept. A prototype is where
 * the habit is set, so a file whose terms are unclear is skipped rather than argued about.
 *
 *   node source.mjs queries.json [minWidth] [out.json]
 */
import fs from 'node:fs';

const UA = 'app-builder-gold-standard/1.0 (internal design prototype)';
const strip = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const queries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const minWidth = Number(process.argv[3] ?? 2200);
const seen = new Set();
const out = [];

for (const query of queries) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `${query} filemime:image/jpeg`, gsrnamespace: '6', gsrlimit: '30',
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '420',
  })) url.searchParams.set(k, v);

  // Commons answers "You are making too many requests" in plain text, not JSON, so an
  // unpaced loop fails as a parse error three queries in and looks like a bug in the caller.
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  const text = await response.text();
  if (!text.startsWith('{')) {
    console.error(`  throttled on "${query}" — waiting 20s and retrying once`);
    await new Promise((r) => setTimeout(r, 20_000));
    const retry = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
    if (!retry.startsWith('{')) { console.error(`  still throttled; skipping "${query}"`); continue; }
    var body = JSON.parse(retry);
  } else {
    var body = JSON.parse(text);
  }
  await new Promise((r) => setTimeout(r, 1500));

  for (const page of Object.values(body.query?.pages ?? {})) {
    const info = (page.imageinfo ?? [])[0] ?? {};
    const meta = info.extmetadata ?? {};
    const title = page.title.replace(/^File:/, '');
    if (seen.has(title) || (info.width ?? 0) < minWidth) continue;
    const licence = strip(meta.LicenseShortName?.value);
    if (!/^(CC BY|CC0|Public domain)/i.test(licence)) continue;
    seen.add(title);
    out.push({
      title, query,
      width: info.width, height: info.height,
      ratio: +(info.width / info.height).toFixed(3),
      licence, author: strip(meta.Artist?.value).slice(0, 60),
      descriptionUrl: info.descriptionurl, full: info.url, thumb: info.thumburl,
    });
  }
}

fs.writeFileSync(process.argv[4] ?? 'candidates.json', JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} candidates >= ${minWidth}px, commercial-reuse licences only`);
for (const r of out) {
  console.log(` ${String(r.width).padStart(5)}x${String(r.height).padEnd(5)} ${String(r.ratio).padEnd(6)} ${r.licence.padEnd(12)} ${r.title.slice(0, 56)}`);
}
