/**
 * Pull the chosen photographs, optimise them, and write the manifest the site renders from.
 *
 * Three, chosen because each carries a piece of product truth rather than atmosphere: where the
 * lime comes from, what the pigment is before it is a colour, and what a lime-burning kiln
 * looks like inside. A paint company that illustrated itself with styled interiors would be
 * showing somebody else's rooms; these show the material.
 *
 * Photographer, licence and source URL travel through to the page. The buildings and materials
 * are real; the company is not, and the page says so.
 */
import fs from 'node:fs';
import sharp from 'sharp';

/*
 * Chosen from a contact sheet, not from a filename.
 *
 * The first version of this list picked "Barrington Chalk Pit 1.jpg" on its title. It is a
 * photograph of a ploughed field with a treeline, and it went onto the opening of the site
 * captioned as the chalk the paint is made from. Everything here has now been looked at at a
 * size where the subject is legible — see sheet.mjs.
 */
const PICKS = [
  { slug: 'chalk-face', title: 'Chalk Face, Betchworth Quarry, Box Hill, Surrey.jpg', usedAs: 'A worked chalk face' },
  { slug: 'kilns', title: 'LimestoneKilnsTalybont.jpg', usedAs: 'A bank of lime kilns' },
  { slug: 'limewashed', title: 'SLATED MANSION, THE BROW, INGLETON.jpg', usedAs: 'Limewash on a rubble-stone wall' },
  { slug: 'pigment', title: 'Links gebrannte Siena, rechts natürliche.JPG', usedAs: 'Burnt sienna and natural sienna, side by side' },
];

const manifest = [];
for (const [index, pick] of PICKS.entries()) {
  if (index) await new Promise((r) => setTimeout(r, 2500));
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent('File:' + pick.title)}&prop=imageinfo&iiprop=url|size|extmetadata`;
  const UA = { 'User-Agent': 'marlpit-gold-standard-prototype/1.0 (App Builder corpus; contact via repository)' };
  const data = await (await fetch(api, { headers: UA })).json();
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page?.imageinfo) { console.error('NO IMAGEINFO for', pick.title, JSON.stringify(data).slice(0, 240)); continue; }
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const strip = (html) => String(html ?? '').replace(/<[^>]*>/g, '').trim();

  const response = await fetch(info.url, { headers: UA });
  if (!response.ok) { console.error('DOWNLOAD FAILED', pick.title, response.status); continue; }
  const bytes = Buffer.from(await response.arrayBuffer());
  for (const [width, suffix] of [[2000, ''], [1000, '-sm']]) {
    await sharp(bytes).rotate().resize(width, null, { withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true })
      .toFile(`public/img/${pick.slug}${suffix}.jpg`);
  }
  const out = sharp(`public/img/${pick.slug}.jpg`);
  const { width, height } = await out.metadata();
  manifest.push({
    slug: pick.slug, usedAs: pick.usedAs, width, height,
    src: `/img/${pick.slug}.jpg`, small: `/img/${pick.slug}-sm.jpg`,
    photographer: strip(meta.Artist?.value) || 'unattributed',
    licence: strip(meta.LicenseShortName?.value) || 'see source',
    sourceUrl: page.title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}` : info.descriptionurl,
    originalPixels: `${info.width}x${info.height}`,
  });
  console.log(`${pick.slug}: ${width}x${height}, ${manifest.at(-1).licence}`);
}
fs.writeFileSync('src/assets/images.json', `${JSON.stringify(manifest, null, 1)}\n`);
