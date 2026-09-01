#!/usr/bin/env node
/**
 * Build a numbered contact sheet from Commons candidates, so imagery is chosen by looking
 * at it.
 *
 * Picking a photograph from its filename is how a build ends up with a hero that is nearly
 * right — correct subject, wrong light, wrong crop, wrong century. The whole premise of this
 * corpus is that rendered evidence beats inspection of the description, and an image is the
 * first place that applies.
 *
 *   node contact-sheet.mjs "search terms" out.jpg [--limit 9] [--min-width 2000]
 *
 * Writes the sheet and prints the index so a choice can be recorded as "row 2, column 1".
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const UA = 'app-builder-gold-reference/1.0 (internal design prototype)';
const argument = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const query = process.argv[2];
const output = process.argv[3];
if (!query || !output) { console.error('usage: contact-sheet.mjs "terms" out.jpg [--limit N]'); process.exit(1); }
const limit = Number(argument('--limit', 9));
const minWidth = Number(argument('--min-width', 2000));

const url = new URL('https://commons.wikimedia.org/w/api.php');
for (const [k, v] of Object.entries({
  action: 'query', format: 'json', generator: 'search',
  gsrsearch: `${query} filemime:image/jpeg`, gsrnamespace: '6', gsrlimit: '40',
  prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '900',
})) url.searchParams.set(k, v);

const body = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
const strip = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const candidates = Object.values(body.query?.pages ?? {})
  .map((page) => {
    const info = (page.imageinfo ?? [])[0] ?? {};
    const meta = info.extmetadata ?? {};
    return {
      title: page.title.replace(/^File:/, ''),
      width: info.width ?? 0,
      licence: strip(meta.LicenseShortName?.value) || 'unknown',
      author: strip(meta.Artist?.value).slice(0, 60) || 'unattributed',
      descriptionUrl: info.descriptionurl ?? '',
      thumb: info.thumburl ?? '',
    };
  })
  .filter((c) => c.width >= minWidth && c.licence !== 'unknown' && c.thumb)
  .slice(0, limit);

if (!candidates.length) { console.error('no candidates'); process.exit(1); }

const CELL = 420, COLS = 3;
const rows = Math.ceil(candidates.length / COLS);
const tiles = [];
for (const [index, candidate] of candidates.entries()) {
  try {
    const bytes = Buffer.from(await (await fetch(candidate.thumb, { headers: { 'User-Agent': UA } })).arrayBuffer());
    // A numbered band under each frame: the sheet is useless if the choice cannot be named.
    const label = Buffer.from(
      `<svg width="${CELL}" height="34"><rect width="100%" height="100%" fill="#111"/>` +
      `<text x="8" y="23" font-family="monospace" font-size="17" fill="#fff">${index + 1}. ${candidate.title.replace(/[<&>]/g, '').slice(0, 42)}</text></svg>`,
    );
    const frame = await sharp(bytes).resize(CELL, CELL - 34, { fit: 'cover', position: 'attention' }).toBuffer();
    tiles.push(await sharp({ create: { width: CELL, height: CELL, channels: 3, background: '#111' } })
      .composite([{ input: frame, top: 0, left: 0 }, { input: label, top: CELL - 34, left: 0 }])
      .jpeg().toBuffer());
  } catch { tiles.push(null); }
}

const usable = tiles.map((tile, i) => ({ tile, candidate: candidates[i] })).filter((entry) => entry.tile);
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
await sharp({ create: { width: CELL * COLS, height: CELL * rows, channels: 3, background: '#111' } })
  .composite(usable.map((entry, i) => ({ input: entry.tile, top: Math.floor(i / COLS) * CELL, left: (i % COLS) * CELL })))
  .jpeg({ quality: 82 }).toFile(output);

console.log(JSON.stringify({ query, sheet: output, candidates: usable.map((e, i) => ({ n: i + 1, ...e.candidate, thumb: undefined })) }, null, 1));
