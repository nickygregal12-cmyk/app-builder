#!/usr/bin/env node
/**
 * Pull the chosen frames, optimise them, and write the manifest the site renders from.
 *
 * Two sizes per frame rather than one. The reference class runs images at full viewport, and
 * a 1600px file stretched across a 2560px display is the difference between photography that
 * dominates and photography that looks like a thumbnail someone enlarged.
 *
 * Every frame keeps its photographer, licence and source URL through to the page. The
 * buildings here are real works by other architects; the practice and its projects are not.
 * That is stated on the page rather than buried, so no frame is ever implied to be owned.
 *
 *   node fetch.mjs candidates.json picks.json outDir
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const candidates = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const picks = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const outDir = process.argv[4] ?? 'public/img';
fs.mkdirSync(outDir, { recursive: true });

const WIDE = 2400;
const NARROW = 1200;
const manifest = [];
const provenance = [];

for (const pick of picks) {
  const source = candidates[pick.index];
  if (!source) { console.error(`no candidate at index ${pick.index}`); continue; }

  // Resume. AVIF at 2400px costs about twenty seconds a frame on four cores, so a run that
  // cannot be restarted is a run that has to finish inside one command timeout.
  if (fs.existsSync(path.join(outDir, `${pick.slug}@sm.jpg`))) {
    const done = await sharp(path.join(outDir, `${pick.slug}.jpg`)).metadata();
    const lq = await sharp(path.join(outDir, `${pick.slug}@sm.jpg`)).resize({ width: 20 }).webp({ quality: 40 }).toBuffer();
    manifest.push({ slug: pick.slug, intrinsic: { width: done.width, height: done.height },
      ratio: +(done.width / done.height).toFixed(4), lqip: `data:image/webp;base64,${lq.toString('base64')}`,
      credit: source.author, licence: source.licence });
    provenance.push({ slug: pick.slug, usedAs: pick.usedAs, sourceTitle: source.title,
      photographer: source.author, licence: source.licence, sourceUrl: source.descriptionUrl,
      originalPixels: `${source.width}x${source.height}`,
      note: 'Existing building by another architect. Prototype imagery; the project described on the page is fictional.' });
    console.log(`${pick.slug.padEnd(26)} cached`);
    continue;
  }

  // upload.wikimedia.org answers a ~2KB rate-limit page rather than an error status, so a
  // tight loop reads as "unsupported image format" on every frame after the first few.
  const grab = async () => Buffer.from(await (await fetch(source.full, {
    headers: { 'User-Agent': 'app-builder-gold-standard/1.0 (internal design prototype)' },
  })).arrayBuffer());
  let bytes = await grab();
  for (let attempt = 0; bytes.length < 50_000 && attempt < 4; attempt += 1) {
    console.error(`  ${pick.slug}: ${bytes.length} bytes, waiting ${(attempt + 1) * 15}s`);
    await new Promise((r) => setTimeout(r, (attempt + 1) * 15_000));
    bytes = await grab();
  }
  await new Promise((r) => setTimeout(r, 2500));

  // A frame that will not decode is not a reason to lose the twenty that already have.
  let base, meta;
  try {
    base = sharp(bytes).rotate();
    meta = await base.metadata();
  } catch {
    console.error(`${pick.slug.padEnd(26)} SKIPPED — source did not decode (${bytes.length} bytes)`);
    continue;
  }

  for (const [suffix, width] of [['', WIDE], ['@sm', NARROW]]) {
    const w = Math.min(width, meta.width);
    await base.clone().resize({ width: w }).avif({ quality: 58 }).toFile(path.join(outDir, `${pick.slug}${suffix}.avif`));
    await base.clone().resize({ width: w }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(outDir, `${pick.slug}${suffix}.jpg`));
  }

  const wide = await sharp(path.join(outDir, `${pick.slug}.jpg`)).metadata();
  const lqip = await base.clone().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();

  manifest.push({
    slug: pick.slug,
    intrinsic: { width: wide.width, height: wide.height },
    ratio: +(wide.width / wide.height).toFixed(4),
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    credit: source.author,
    licence: source.licence,
  });

  provenance.push({
    slug: pick.slug,
    usedAs: pick.usedAs,
    sourceTitle: source.title,
    photographer: source.author,
    licence: source.licence,
    sourceUrl: source.descriptionUrl,
    originalPixels: `${source.width}x${source.height}`,
    note: 'Existing building by another architect. Prototype imagery; the project described on the page is fictional.',
  });

  console.log(`${pick.slug.padEnd(26)} ${wide.width}x${wide.height}  ${source.licence}`);
}

fs.writeFileSync('src/assets/images.json', JSON.stringify(manifest, null, 1) + '\n');
fs.writeFileSync('src/assets/provenance.json', JSON.stringify(provenance, null, 1) + '\n');
console.log(`\n${manifest.length} frames, manifest and provenance written`);
