/**
 * Pull the chosen photographs, optimise them, and write the manifest the site renders from.
 *
 * Five, and the selection rule is the one stated in BUSINESS.txt: every photograph on this site
 * shows either the crossing or the island's fabric. No interiors, no styled breakfasts, no
 * couple on a beach, no drone shot of a headland at golden hour. A picture that could be
 * captioned "somewhere nice" is the luxury-slop fixture and does not go on.
 *
 * All five were chosen from a contact sheet at a size where the subject is legible — see
 * sheet.mjs, and the prototype-C mistake it exists to prevent.
 *
 * ## The honesty problem, which is specific to this prototype
 *
 * Hallowsand is invented. These photographs are of real places — mostly Lindisfarne, which is a
 * real tidal island with a real causeway and real refuge boxes. Using them to illustrate a
 * fictional island is fine only if the site never implies they are the island. So the manifest
 * carries `where` as well as `usedAs`, both are printed in the caption, and the credit line says
 * the place out loud. A reader is told, on the page, that they are looking at Holy Island and
 * not at the thing being let.
 *
 * Photographer, licence and source URL travel through to the page. Geograph images are CC BY-SA
 * 2.0: attribution is required and the licence is named and linked at every use.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const PICKS = [
  {
    slug: 'causeway',
    title: 'Refuge Box on Lindisfarne Causeway (1) - geograph.org.uk - 4207748.jpg',
    where: 'Holy Island, Northumberland',
    usedAs: 'A causeway at low water, with its refuge box',
    alt: 'A single-track causeway running dead straight to the horizon across wet tidal sand, with a timber refuge box raised on stilts standing about halfway along it.',
  },
  {
    slug: 'flood',
    title: 'Refuge box on the Lindisfarne causeway - geograph.org.uk - 7141048.jpg',
    where: 'Holy Island, Northumberland',
    usedAs: 'The same road with the water coming back over the sands',
    alt: 'Water lying across the sand flats either side of a causeway, reaching the edge of the road surface, with a refuge box on stilts in the middle distance.',
  },
  {
    slug: 'kiln',
    title: 'Lime Kilns, Lindisfarne - geograph.org.uk - 6391513.jpg',
    where: 'Holy Island, Northumberland',
    usedAs: 'A bank of lime kilns of the kind on the island',
    alt: 'A large squat stone structure built into a grass bank, with three tall arched openings along its face.',
  },
  {
    slug: 'chapel',
    title: 'Mortuary Chapel on south side of Church Hill - geograph.org.uk - 2985136.jpg',
    where: 'Caithness',
    usedAs: 'A roofless chapel of the kind that stands above the landing',
    alt: 'A small roofless stone chapel standing alone in rough grass, its gable ends and window openings intact.',
  },
  {
    slug: 'shore',
    title: 'Rocky shore at Beadnell - geograph.org.uk - 5485072.jpg',
    where: 'Beadnell, Northumberland',
    usedAs: 'The shore on the seaward side',
    alt: 'A low rocky foreshore of flat weathered ledges running out to a calm grey sea under a pale sky.',
  },
];

const UA = { 'User-Agent': 'hallowsand-gold-standard-prototype/1.0 (App Builder corpus; contact via repository)' };
const strip = (html) => String(html ?? '').replace(/<[^>]*>/g, '').trim();
const manifest = [];

/**
 * Fetch an image and prove it is one before handing it to sharp.
 *
 * The first run of this script died on the third photograph with "Input buffer contains
 * unsupported image format", which reads like a bad pick and was not — the same URL fetched
 * cleanly a minute later. Commons rate-limits, and a rate-limited response is a perfectly valid
 * HTTP 200 carrying an HTML error page that sharp is then asked to resize.
 *
 * Checking the content type turns that into a retry instead of a crash, and turns a script that
 * happened to work into one that can be run again.
 */
async function image(url) {
  let last = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 4000 * attempt));
    const response = await fetch(url, { headers: UA });
    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.startsWith('image/')) return Buffer.from(await response.arrayBuffer());
    last = `${response.status} ${type}`;
  }
  throw new Error(`not an image after 4 attempts (${last}): ${url}`);
}

for (const [index, pick] of PICKS.entries()) {
  if (index) await new Promise((r) => setTimeout(r, 2500));
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent('File:' + pick.title)}&prop=imageinfo&iiprop=url|size|extmetadata`;
  const data = await (await fetch(api, { headers: UA })).json();
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page?.imageinfo) {
    console.error('NO IMAGEINFO for', pick.title);
    process.exitCode = 1;
    continue;
  }
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const source = await image(info.url);

  // Two widths, and the small one is not a thumbnail of the large one — it is a separate
  // resize from the original, because a 1600px downscale of a 2400px downscale is visibly
  // softer than a 1600px downscale of a 5184px original.
  for (const width of [2000, 1100]) {
    await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toFile(`public/img/${pick.slug}-${width}.jpg`);
  }
  const { width, height } = await sharp(source).metadata();

  manifest.push({
    slug: pick.slug,
    where: pick.where,
    usedAs: pick.usedAs,
    alt: pick.alt,
    aspect: Number((width / height).toFixed(4)),
    photographer: strip(meta.Artist?.value) || 'Unknown',
    licence: strip(meta.LicenseShortName?.value) || 'see source',
    licenceUrl: strip(meta.LicenseUrl?.value) || '',
    source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
  });
  console.log('ok', pick.slug, `${width}x${height}`, manifest.at(-1).licence);
}

fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync(
  'src/data/photographs.json',
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`${manifest.length} photographs -> src/data/photographs.json`);
