#!/usr/bin/env node
/**
 * Find openly-licensed photographs on Wikimedia Commons, and record where each came from.
 *
 * A synthetic business has no photographs, because its buildings do not exist. That is a
 * real constraint and not a reason to design badly: the point of this corpus is to remove
 * asset scarcity as the explanation for a weak result, so the images need to be good enough
 * that nobody can blame them.
 *
 * Commons rather than a stock library, for one reason that matters: every file carries its
 * licence, author and source URL in the API response, so provenance is recorded rather than
 * assumed. `docs/VISUAL_EXCELLENCE.md` asks that an asset never claim rights it does not
 * have, and a prototype is not an exception to that — it is where the habit is set.
 *
 *   node source-images.mjs "search terms" [--limit 12] [--min-width 1600]
 */
import process from 'node:process';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'app-builder-gold-reference/1.0 (internal design prototype; contact: studio@example.invalid)';

const argument = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};

const query = process.argv[2];
if (!query || query.startsWith('--')) {
  console.error('usage: source-images.mjs "search terms" [--limit N] [--min-width N]');
  process.exit(1);
}
const limit = Number(argument('--limit', 12));
const minWidth = Number(argument('--min-width', 1600));

const url = new URL(API);
for (const [k, v] of Object.entries({
  action: 'query', format: 'json', generator: 'search',
  gsrsearch: `${query} filemime:image/jpeg`,
  gsrnamespace: '6', gsrlimit: String(Math.min(limit * 3, 50)),
  prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '2000',
})) url.searchParams.set(k, v);

const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
if (!response.ok) { console.error(`Commons returned ${response.status}`); process.exit(1); }
const body = await response.json();
const pages = Object.values(body.query?.pages ?? {});

const strip = (value) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const rows = pages
  .map((page) => {
    const info = (page.imageinfo ?? [])[0] ?? {};
    const meta = info.extmetadata ?? {};
    return {
      title: page.title.replace(/^File:/, ''),
      width: info.width ?? 0,
      height: info.height ?? 0,
      licence: strip(meta.LicenseShortName?.value) || 'unknown',
      author: strip(meta.Artist?.value).slice(0, 70) || 'unattributed',
      credit: strip(meta.Credit?.value).slice(0, 60),
      descriptionUrl: info.descriptionurl ?? '',
      downloadUrl: info.thumburl ?? info.url ?? '',
    };
  })
  // A photograph narrower than the widest place it will be shown is a photograph that will
  // be upscaled, and an upscaled hero is the single most obvious tell of a weak build.
  .filter((row) => row.width >= minWidth && row.licence !== 'unknown')
  .slice(0, limit);

console.log(JSON.stringify({ query, found: rows.length, results: rows }, null, 2));
