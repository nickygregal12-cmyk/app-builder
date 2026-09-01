/**
 * Contact sheets, because a filename is not a photograph.
 *
 * The first pick for this prototype was "Barrington Chalk Pit 1.jpg", which is a photograph of
 * a ploughed field with a treeline on the horizon. Chosen from its title, it went straight onto
 * the opening of the site as "the chalk, four miles from the mill". Every candidate gets looked
 * at now, at a size where the subject is legible, with its index printed on it.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const UA = { 'User-Agent': 'marlpit-gold-standard-prototype/1.0 (App Builder corpus)' };
const queries = process.argv.slice(3);
const out = process.argv[2];
const rows = [];

for (const q of queries) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}%20filetype:bitmap&gsrlimit=12&gsrnamespace=6&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=420`;
  const data = await (await fetch(url, { headers: UA })).json();
  for (const page of Object.values(data.query?.pages ?? {})) {
    const info = page.imageinfo[0];
    const lic = String(info.extmetadata?.LicenseShortName?.value ?? '');
    if (info.width < 1500) continue;
    if (!/CC|Public/i.test(lic)) continue;
    rows.push({ title: page.title, thumb: info.thumburl, width: info.width, height: info.height, licence: lic, query: q });
  }
}

const COLS = 4, CELL = 300, LABEL = 30;
const sheetRows = Math.ceil(rows.length / COLS);
const tiles = [];
for (const [i, row] of rows.entries()) {
  const buf = Buffer.from(await (await fetch(row.thumb, { headers: UA })).arrayBuffer());
  const img = await sharp(buf).resize(CELL, CELL, { fit: 'cover' }).toBuffer();
  tiles.push({ input: img, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * (CELL + LABEL) });
  const label = await sharp({ create: { width: CELL, height: LABEL, channels: 3, background: '#111' } })
    .composite([{ input: Buffer.from(`<svg width="${CELL}" height="${LABEL}"><text x="6" y="20" fill="#eee" font-family="sans-serif" font-size="13">${i}. ${row.title.slice(5, 40).replace(/&/g, '&amp;')}</text></svg>`), top: 0, left: 0 }])
    .png().toBuffer();
  tiles.push({ input: label, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * (CELL + LABEL) + CELL });
}
await sharp({ create: { width: COLS * CELL, height: sheetRows * (CELL + LABEL), channels: 3, background: '#111' } })
  .composite(tiles).jpeg({ quality: 82 }).toFile(out);
fs.writeFileSync(out.replace(/\.jpg$/, '.json'), `${JSON.stringify(rows, null, 1)}\n`);
console.log(`${rows.length} candidates -> ${out}`);
