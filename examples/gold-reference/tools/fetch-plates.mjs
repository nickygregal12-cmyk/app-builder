#!/usr/bin/env node
/**
 * Fetch one botanical plate per species, and record where each came from.
 *
 * The design idea for this studio is a plant register rather than a photograph gallery, so
 * the imagery is one plate per plant and the plate has to be the *right* plant. Searching per
 * species rather than per mood is the difference between a register and a mood board.
 */
import fs from 'node:fs';
import path from 'node:path';
const UA = 'app-builder-gold-reference/1.0 (internal design prototype)';
const OUT = process.argv[2] ?? 'raw';
const species = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const strip = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const records = [];

for (const entry of species) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `${entry.query} filemime:image/jpeg`, gsrnamespace: '6', gsrlimit: '18',
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1400',
  })) url.searchParams.set(k, v);
  const body = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  const best = Object.values(body.query?.pages ?? {})
    .map((p) => { const i = (p.imageinfo ?? [])[0] ?? {}; const m = i.extmetadata ?? {};
      return { title: p.title.replace(/^File:/, ''), width: i.width ?? 0, height: i.height ?? 0,
        licence: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value).slice(0, 60),
        descriptionUrl: i.descriptionurl, thumb: i.thumburl }; })
    // Plates are portrait; a landscape hit is usually a page spread or a photograph.
    .filter((c) => c.width >= 900 && c.thumb && c.height > c.width)
    .sort((a, b) => b.width - a.width)[0];
  if (!best) { console.log(`  MISS  ${entry.slug}`); continue; }
  const bytes = Buffer.from(await (await fetch(best.thumb, { headers: { 'User-Agent': UA } })).arrayBuffer());
  fs.writeFileSync(path.join(OUT, `${entry.slug}.jpg`), bytes);
  records.push({ ...entry, ...best, thumb: undefined });
  console.log(`  ok    ${entry.slug.padEnd(22)} ${best.licence.padEnd(16)} ${best.title.slice(0, 46)}`);
}
fs.writeFileSync(path.join(OUT, 'provenance.json'), JSON.stringify(records, null, 2) + '\n');
console.log(`\n${records.length}/${species.length} plates`);
