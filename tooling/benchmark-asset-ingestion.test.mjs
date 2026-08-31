/**
 * Ingesting supplied benchmark bytes, held to what the plan asked for.
 *
 * The point of this path is that when images finally arrive, binding them to the
 * benchmark is mechanical rather than another session of deciding what things
 * are. That only holds if the binding is strict: a file that does not match a
 * planned ID, cannot be decoded, or is the wrong shape for its slot must be
 * refused here, because every one of those is far more expensive to discover
 * from a screenshot.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import test from 'node:test';

import { ingestBenchmarkAssets, orientationOf, readImageDimensions } from './lib/benchmark-asset-ingestion.mjs';

/** A real, decodable PNG of an exact size — not a hand-faked header. */
function png(width, height) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}

const PLAN = {
  caseId: 'test-case',
  assets: [
    { assetId: 'brand-wordmark', role: 'brand', orientation: 'square', required: true },
    { assetId: 'home-hero', role: 'hero', orientation: 'landscape', required: true },
    { assetId: 'person-one', role: 'portrait', orientation: 'portrait', required: false },
  ],
};

function directory(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-assets-'));
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(root, name), bytes);
  return root;
}

const ingest = (assetDir) => ingestBenchmarkAssets({ plan: PLAN, assetDir, sourceId: 'supplied' });

test('dimensions come from the file rather than from its name', () => {
  assert.deepEqual(readImageDimensions(png(1200, 800)), { width: 1200, height: 800, format: 'png' });
  assert.equal(readImageDimensions(Buffer.from('not an image at all, just text')), null);
  // An SVG has no intrinsic pixel size, and a wordmark legitimately arrives as
  // one — readable, dimensions unknown, not an error.
  const svg = readImageDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  assert.equal(svg.format, 'svg');
  assert.equal(svg.width, null);
});

test('orientation is read in the plan\'s own vocabulary', () => {
  assert.equal(orientationOf({ width: 1600, height: 900 }), 'landscape');
  assert.equal(orientationOf({ width: 900, height: 1600 }), 'portrait');
  assert.equal(orientationOf({ width: 1000, height: 1000 }), 'square');
  assert.equal(orientationOf({ width: null, height: null }), null);
});

test('a supplied file binds to the asset ID its name claims', () => {
  const result = ingest(directory({ 'home-hero.png': png(1600, 900) }));
  assert.deepEqual(result.ingested, ['home-hero']);
  assert.equal(result.assets.length, 1);
  const [asset] = result.assets;
  assert.equal(asset.id, 'home-hero');
  assert.equal(asset.provenance, 'generated', 'benchmark bytes were invented and must say so');
  assert.equal(asset.publishUseAllowed, true);
  assert.equal(asset.instructionAuthority, 'none');
  assert.match(asset.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(asset.width, 1600);
});

test('a brand asset points at the source that actually grants it', () => {
  // Wordmark and photography are separately approved sources. An asset pointing
  // at the wrong one would claim rights it was never given.
  const result = ingestBenchmarkAssets({
    plan: PLAN,
    assetDir: directory({ 'brand-wordmark.png': png(512, 512), 'home-hero.png': png(1600, 900) }),
    sourceIdFor: (asset) => (asset.role === 'brand' ? 'wordmark-source' : 'photography-source'),
  });
  const byId = Object.fromEntries(result.assets.map((asset) => [asset.id, asset]));
  assert.equal(byId['brand-wordmark'].sourceId, 'wordmark-source');
  assert.equal(byId['brand-wordmark'].sourceRole, 'primary-brand');
  assert.equal(byId['home-hero'].sourceId, 'photography-source');
  assert.equal(byId['home-hero'].sourceRole, 'content');
});

test('a portrait slot filled with a landscape frame is the wrong picture, not a crop', () => {
  const result = ingest(directory({ 'person-one.png': png(1600, 900) }));
  assert.deepEqual(result.ingested, []);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /planned portrait, supplied landscape/);
  assert.match(result.problems[0], /wrong picture/);
});

test('a truncated download is caught here, because a hash of a broken file is still a hash', () => {
  const result = ingest(directory({ 'home-hero.png': Buffer.from('\x89PNG\r\n\x1a\n truncated') }));
  assert.deepEqual(result.ingested, []);
  assert.match(result.problems[0], /not a readable image/);
});

test('a file nobody planned is named and never ingested', () => {
  const result = ingest(directory({ 'home-hero.png': png(1600, 900), 'a-nice-extra.png': png(1600, 900) }));
  assert.deepEqual(result.ingested, ['home-hero']);
  assert.deepEqual(result.unplanned, ['a-nice-extra']);
  assert.equal(result.assets.length, 1, 'an unplanned image must not reach a page');
});

test('what is still missing is reported, and required is reported separately', () => {
  const result = ingest(directory({ 'person-one.png': png(900, 1600) }));
  assert.deepEqual(result.ingested, ['person-one']);
  assert.deepEqual(result.missing.sort(), ['brand-wordmark', 'home-hero']);
  // The optional portrait arriving does not make the required set any closer.
  assert.deepEqual(result.missingRequired.sort(), ['brand-wordmark', 'home-hero']);
});

test('an empty or absent directory ingests nothing and invents nothing', () => {
  for (const assetDir of [directory({}), null, path.join(os.tmpdir(), 'does-not-exist-at-all')]) {
    const result = ingest(assetDir);
    assert.deepEqual(result.assets, []);
    assert.equal(result.missingRequired.length, 2);
    assert.deepEqual(result.problems, [], 'no bytes is not a malformed byte');
  }
});
