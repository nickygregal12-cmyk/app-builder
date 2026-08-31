/**
 * Turning supplied image bytes into benchmark assets.
 *
 * The asset plan names what the benchmark needs and why. This is the step that
 * takes a directory of files produced against that plan and binds them to it, so
 * that when bytes arrive the work is mechanical rather than another session of
 * deciding what things are.
 *
 * WHY IT KNOWS NOTHING ABOUT WHERE THE BYTES CAME FROM
 *
 * A governed image generator, a commissioned photographer, a rights-cleared
 * library, an externally supplied benchmark set — the factory's requirement is
 * *governed synthetic bytes with explicit provenance and publication
 * permission*, and which source produced them is an owner decision that must
 * never become a contract. So this takes a directory. Swapping the source
 * changes what is in the directory and nothing here.
 *
 * WHAT IT REFUSES
 *
 * A file whose name does not match a planned asset ID. The plan is the
 * specification, and a file nobody asked for is more likely a mistake than a
 * gift — silently ingesting it would put an unplanned image on a page and leave
 * the plan describing something else.
 *
 * A file that is not an image it can read. `contentHash` is required by the
 * knowledge pack and a hash of a broken file is still a hash, so the only place
 * to catch a truncated download is here, by decoding the header.
 *
 * An image whose shape contradicts the slot it was made for. A portrait frame
 * delivered landscape is not a cropping problem, it is the wrong picture, and
 * discovering that from a screenshot costs a whole run.
 *
 * It deliberately does not judge photographs. Whether an image is any good is a
 * question for the independent reviewer.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXTENSIONS = Object.freeze(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg']);

/**
 * Width and height from the file header, without a decoder dependency.
 *
 * Only the containers the benchmark actually accepts, and only enough of each to
 * reach the dimensions. Returning null for a file this cannot read is the honest
 * answer and is treated as a problem by the caller rather than waved through.
 */
export function readImageDimensions(bytes) {
  // PNG: IHDR is always the first chunk, width and height big-endian at 16..24.
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' };
  }
  // JPEG: walk the segment chain to a start-of-frame marker, which carries size.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      // SOF0..SOF15, excluding the four that are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7), format: 'jpeg' };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return null;
  }
  // WebP: RIFF container, then one of three chunk layouts.
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, format: 'webp' };
    if (chunk === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: 'webp' };
    }
    if (chunk === 'VP8X') {
      const read24 = (at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
      return { width: read24(24) + 1, height: read24(27) + 1, format: 'webp' };
    }
  }
  // SVG has no intrinsic pixel size worth checking, and a wordmark is the case
  // that legitimately arrives as one. Declared readable, dimensions unknown.
  if (bytes.length >= 5 && (bytes.toString('utf8', 0, 200).includes('<svg') || bytes.toString('utf8', 0, 5) === '<?xml')) {
    return { width: null, height: null, format: 'svg' };
  }
  return null;
}

/** The orientation an image actually has, in the plan's own vocabulary. */
export function orientationOf({ width, height }) {
  if (!width || !height) return null;
  const ratio = width / height;
  if (ratio > 1.05) return 'landscape';
  if (ratio < 0.95) return 'portrait';
  return 'square';
}

/**
 * Files in a directory, keyed by the asset ID their name claims.
 *
 * The filename stem is the binding. It is boring on purpose: whoever produces
 * the bytes gets a list of IDs, and naming the file after the ID is the whole
 * protocol. Nothing has to be embedded in the image, and no side-file has to
 * stay in step with it.
 */
export function readAssetDirectory(assetDir) {
  if (!assetDir || !fs.existsSync(assetDir)) return new Map();
  const found = new Map();
  for (const entry of fs.readdirSync(assetDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension)) continue;
    found.set(path.basename(entry.name, extension), { file: path.join(assetDir, entry.name), extension });
  }
  return found;
}

/**
 * Bind supplied bytes to a plan, and report exactly what arrived.
 *
 * Returns knowledge-pack asset entries for what was ingested, plus the three
 * things whoever produced the bytes needs to know: what is still missing, what
 * arrived that nobody planned, and what arrived broken.
 */
export function ingestBenchmarkAssets({ plan, assetDir, sourceId, sourceIdFor = null }) {
  // A benchmark declares its wordmark and its photography as separate approved
  // sources, because they are separately granted. An ingested asset has to point
  // at the one that actually covers it, or the pack would claim rights it was
  // never given.
  const resolveSource = sourceIdFor ?? (() => sourceId);
  const planned = Array.isArray(plan?.assets) ? plan.assets : [];
  const supplied = readAssetDirectory(assetDir);
  const byId = new Map(planned.map((asset) => [asset.assetId, asset]));

  const assets = [];
  const problems = [];
  const ingested = [];

  for (const asset of planned) {
    const entry = supplied.get(asset.assetId);
    if (!entry) continue;
    const bytes = fs.readFileSync(entry.file);
    const dimensions = readImageDimensions(bytes);
    if (!dimensions) {
      problems.push(`${asset.assetId}: ${path.basename(entry.file)} is not a readable image. A hash of a truncated file is still a hash, so this is the only place it can be caught.`);
      continue;
    }
    const actual = orientationOf(dimensions);
    if (asset.orientation && actual && actual !== asset.orientation) {
      problems.push(`${asset.assetId}: planned ${asset.orientation}, supplied ${actual} (${dimensions.width}×${dimensions.height}). That is the wrong picture rather than a cropping problem.`);
      continue;
    }
    assets.push({
      id: asset.assetId,
      sourceId: resolveSource(asset),
      kind: 'image',
      contentHash: crypto.createHash('sha256').update(bytes).digest('hex'),
      // Everything in this corpus is invented, and the asset says so in the same
      // words its source does rather than in a second vocabulary.
      provenance: 'generated',
      rightsStatus: 'approved-for-use',
      assetStatus: 'approved',
      sourceRole: asset.role === 'brand' ? 'primary-brand' : 'content',
      sourceChannel: 'upload',
      instructionAuthority: 'none',
      publishUseAllowed: true,
      width: dimensions.width,
      height: dimensions.height,
    });
    ingested.push(asset.assetId);
  }

  const missing = planned.filter((asset) => !ingested.includes(asset.assetId)).map((asset) => asset.assetId);
  const missingRequired = planned.filter((asset) => asset.required && !ingested.includes(asset.assetId)).map((asset) => asset.assetId);
  // A file nobody planned is more likely a mistake than a gift. Named, never
  // ingested: putting an unplanned image on a page would leave the plan
  // describing something the site is not.
  const unplanned = [...supplied.keys()].filter((id) => !byId.has(id));

  return { assets, ingested, missing, missingRequired, unplanned, problems };
}
