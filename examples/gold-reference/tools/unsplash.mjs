#!/usr/bin/env node
/**
 * Source prototype photography from Unsplash, and record where every frame came from.
 *
 * Wikimedia Commons was tried first and measured: it is an archive, and full-text search for
 * contemporary interiors returns heritage survey documentation and digitised 1921 catalogues.
 * Excellent provenance, wrong material. This is the route the brief preferred anyway.
 *
 * Three things this does that a bare `curl` would not:
 *
 *   1. **It never prints the key.** The credential is read from a file outside the repository
 *      and used in a header. A key that reaches stdout reaches a log, a transcript and a
 *      screenshot.
 *   2. **It triggers the download endpoint.** Unsplash's API terms require that a download is
 *      registered when a photo is actually taken. Skipping it is invisible and is still a
 *      breach of the terms the imagery is being used under, which is not a habit worth having
 *      in a corpus about not claiming rights you do not hold.
 *   3. **It writes provenance beside the bytes.** Photographer, profile, photo URL and licence
 *      land in assets.json. `docs/VISUAL_EXCELLENCE.md` asks that an asset never claim rights
 *      it does not have; a prototype is where that habit is set, not an exception to it.
 *
 *   node unsplash.mjs search "terms" [--limit 12] [--orientation landscape]
 *   node unsplash.mjs sheet  "terms" out.jpg [--limit 9]
 *   node unsplash.mjs fetch  <photoId> <slug> --out <dir> [--width 2400]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const KEY_FILE = path.join(os.homedir(), '.config/unsplash/access-key');
const API = 'https://api.unsplash.com';

function accessKey() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error(`No Unsplash key at ${KEY_FILE}.`);
    console.error("Create it in a terminal:  printf '%s' 'KEY' > ~/.config/unsplash/access-key");
    process.exit(1);
  }
  const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!key) { console.error(`${KEY_FILE} is empty.`); process.exit(1); }
  return key;
}

const argument = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

async function api(pathname, params = {}) {
  const url = new URL(pathname, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const response = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey()}`, 'Accept-Version': 'v1' },
  });
  if (!response.ok) {
    // Report the status and never the request, because the request carries the credential.
    console.error(`Unsplash returned ${response.status} for ${pathname}`);
    if (response.status === 401) console.error('The key was rejected. Check it is the Access Key, not the Secret Key.');
    if (response.status === 403) console.error('Rate limited — the demo tier allows 50 requests an hour.');
    process.exit(1);
  }
  return response.json();
}

/** What travels with a frame for the rest of its life. */
const provenanceOf = (photo) => ({
  id: photo.id,
  description: photo.description || photo.alt_description || null,
  width: photo.width,
  height: photo.height,
  colour: photo.color,
  photographer: photo.user?.name ?? 'unknown',
  photographerProfile: photo.user?.links?.html ?? null,
  photoUrl: photo.links?.html ?? null,
  licence: 'Unsplash License (free to use, attribution appreciated, not owned by the depicted business)',
  source: 'unsplash',
});

async function search(terms, limit, orientation) {
  const body = await api('/search/photos', {
    query: terms, per_page: Math.min(limit, 30), orientation, content_filter: 'high',
  });
  return (body.results ?? []).map((photo) => ({ ...provenanceOf(photo), thumb: photo.urls?.small, regular: photo.urls?.regular }));
}

async function download(photo, width) {
  // Register the download first: the terms ask for it whether or not anyone checks.
  if (photo.downloadLocation) {
    try { await api(new URL(photo.downloadLocation).pathname + new URL(photo.downloadLocation).search); } catch { /* non-fatal */ }
  }
  const url = new URL(photo.raw ?? photo.regular);
  url.searchParams.set('w', String(width));
  url.searchParams.set('q', '85');
  url.searchParams.set('fm', 'jpg');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const [command] = process.argv.slice(2);

if (command === 'search') {
  const results = await search(process.argv[3], Number(argument('--limit', 12)), argument('--orientation', 'landscape'));
  console.log(JSON.stringify({ query: process.argv[3], found: results.length, results: results.map(({ thumb, regular, ...rest }) => rest) }, null, 1));

} else if (command === 'sheet') {
  const terms = process.argv[3];
  const output = process.argv[4];
  const limit = Number(argument('--limit', 9));
  const results = await search(terms, limit, argument('--orientation', 'landscape'));
  if (!results.length) { console.error('no results'); process.exit(1); }

  const CELL = 420, COLS = 3;
  const rows = Math.ceil(results.length / COLS);
  const tiles = [];
  for (const [index, photo] of results.entries()) {
    const bytes = Buffer.from(await (await fetch(photo.thumb)).arrayBuffer());
    const caption = `${index + 1}. ${(photo.description ?? photo.photographer).replace(/[<&>]/g, '').slice(0, 40)}`;
    const label = Buffer.from(
      `<svg width="${CELL}" height="34"><rect width="100%" height="100%" fill="#111"/>` +
      `<text x="8" y="23" font-family="monospace" font-size="17" fill="#fff">${caption}</text></svg>`);
    const frame = await sharp(bytes).resize(CELL, CELL - 34, { fit: 'cover', position: 'attention' }).toBuffer();
    tiles.push(await sharp({ create: { width: CELL, height: CELL, channels: 3, background: '#111' } })
      .composite([{ input: frame, top: 0, left: 0 }, { input: label, top: CELL - 34, left: 0 }]).jpeg().toBuffer());
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  await sharp({ create: { width: CELL * COLS, height: CELL * rows, channels: 3, background: '#111' } })
    .composite(tiles.map((tile, i) => ({ input: tile, top: Math.floor(i / COLS) * CELL, left: (i % COLS) * CELL })))
    .jpeg({ quality: 82 }).toFile(output);
  console.log(JSON.stringify({ sheet: output, candidates: results.map((r, i) => ({ n: i + 1, id: r.id, photographer: r.photographer, description: r.description })) }, null, 1));

} else if (command === 'fetch') {
  const [, , , id, slug] = process.argv;
  const outDir = path.resolve(argument('--out', 'public/images'));
  const width = Number(argument('--width', 2400));
  const photo = await api(`/photos/${id}`);
  const record = provenanceOf(photo);
  const bytes = await download({ raw: photo.urls?.raw, regular: photo.urls?.regular, downloadLocation: photo.links?.download_location }, width);

  fs.mkdirSync(outDir, { recursive: true });
  // Two formats and a small blur placeholder: an image-heavy page that ships one huge JPEG
  // per project is a performance failure dressed as art direction.
  const base = sharp(bytes).resize(width, null, { withoutEnlargement: true });
  await base.clone().avif({ quality: 55 }).toFile(path.join(outDir, `${slug}.avif`));
  await base.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, `${slug}.jpg`));
  const meta = await sharp(bytes).metadata();
  const placeholder = (await sharp(bytes).resize(20).blur(1).webp({ quality: 40 }).toBuffer()).toString('base64');

  console.log(JSON.stringify({
    ...record, slug,
    files: [`${slug}.avif`, `${slug}.jpg`],
    intrinsic: { width: meta.width, height: meta.height },
    placeholder: `data:image/webp;base64,${placeholder}`,
  }, null, 1));

} else {
  console.error('usage: unsplash.mjs <search|sheet|fetch> ...');
  process.exit(1);
}
