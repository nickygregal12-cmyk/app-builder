import fs from 'node:fs/promises';
import path from 'node:path';
import { extractBuffer, materializeImageVariants } from './extractors.js';
import { deriveSourceGovernance } from './governance.js';
import { CONTENT_INTELLIGENCE_VERSION, DEFAULT_LIMITS, assertSafeRemoteUrl, inferMime, inferSourceKind, loadSourceBytes, sha256, stableId } from './shared.js';

async function readCachedExtraction(cacheDir, cacheKey) {
  if (!cacheDir) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(cacheDir, `${cacheKey}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function writeCachedExtraction(cacheDir, cacheKey, extraction) {
  if (!cacheDir) return;
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(path.join(cacheDir, `${cacheKey}.json`), JSON.stringify({ intelligenceVersion: CONTENT_INTELLIGENCE_VERSION, extraction }, null, 2) + '\n');
}

export async function normalizeSource(source, options = {}) {
  const limits = Object.assign({}, DEFAULT_LIMITS, options.limits);
  const loaded = await loadSourceBytes(source, limits, options);
  const mimeType = inferMime(source, loaded.contentType);
  const contentHash = sha256(loaded.buffer);
  const cacheKey = sha256(`${CONTENT_INTELLIGENCE_VERSION}:${mimeType}:${contentHash}`);
  const cached = await readCachedExtraction(options.cacheDir, cacheKey);
  const extraction = cached?.extraction ?? await extractBuffer(loaded.buffer, mimeType, source, limits);
  if (!cached) await writeCachedExtraction(options.cacheDir, cacheKey, extraction);
  const variants = extraction.type === 'image'
    ? await materializeImageVariants(loaded.buffer, contentHash, { ...options, fs })
    : [];
  const kind = inferSourceKind({ ...source, mimeType });
  const provenance = source.provenance ?? (kind === 'url' ? 'existing-site' : 'user-supplied');
  const governance = deriveSourceGovernance({ ...source, uri: loaded.resolvedUri, provenance }, kind);
  return {
    id: source.id ?? stableId('source', source.label ?? source.name ?? loaded.resolvedUri ?? contentHash, contentHash),
    kind,
    label: String(source.label ?? source.name ?? loaded.resolvedUri ?? 'Source'),
    uri: loaded.resolvedUri,
    mimeType,
    sizeBytes: loaded.buffer.length,
    provenance,
    purpose: source.purpose ?? null,
    ...governance,
    contentHash,
    cacheKey,
    cacheHit: Boolean(cached),
    extractorVersion: CONTENT_INTELLIGENCE_VERSION,
    extraction,
    variants,
  };
}

export async function normalizeSources(sources, options = {}) {
  const normalized = [];
  for (const source of sources) normalized.push(await normalizeSource(source, options));
  return normalized;
}

export function normalizeReferenceSource(source) {
  if (!source?.uri) throw new Error('Reference source requires uri.');
  const uri = assertSafeRemoteUrl(source.uri).toString();
  const kind = source.kind ?? 'url';
  const provenance = source.provenance ?? 'external-research';
  const governance = deriveSourceGovernance({ ...source, uri, provenance, rightsStatus: source.rightsStatus ?? 'reference-only' }, kind);
  const contentHash = sha256(`reference:${uri}`);
  return {
    id: source.id ?? stableId('source', source.label ?? uri, contentHash),
    kind,
    label: String(source.label ?? uri),
    uri,
    mimeType: 'text/uri-list',
    sizeBytes: 0,
    provenance,
    purpose: source.purpose ?? 'public reference',
    ...governance,
    contentHash,
    cacheKey: null,
    cacheHit: false,
    extractorVersion: CONTENT_INTELLIGENCE_VERSION,
    extraction: { type: 'reference', text: '', truncated: false, metadata: {}, headings: [], tables: [], links: [], images: [] },
    variants: [],
    referenceOnly: true,
  };
}

function crawlCandidate(href, baseUrl, acceptedOrigin) {
  if (!href || /^(?:mailto:|tel:|javascript:|data:)/i.test(href)) return null;
  let url;
  try { url = new URL(href, baseUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== acceptedOrigin) return null;
  if (/\.(?:pdf|docx?|xlsx?|csv|zip|jpe?g|png|gif|webp|avif|svg|mp4|webm|mp3|wav|woff2?|ttf|ico)$/i.test(url.pathname)) return null;
  url.hash = '';
  url.search = '';
  return url.toString();
}

export async function normalizeWebsite(startUrl, options = {}) {
  const maxPages = Math.max(1, Math.min(Number(options.maxPages ?? 12), 25));
  const initial = assertSafeRemoteUrl(startUrl).toString();
  const queue = [initial];
  const queued = new Set(queue);
  const visited = new Set();
  const sources = [];
  let acceptedOrigin = new URL(initial).origin;
  while (queue.length && sources.length < maxPages) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    const normalized = await normalizeSource({ uri: current, label: current, kind: 'url', provenance: 'existing-site', purpose: 'existing-site page' }, options);
    sources.push(normalized);
    const resolved = normalized.uri ?? current;
    if (sources.length === 1) acceptedOrigin = new URL(resolved).origin;
    if (normalized.extraction.type !== 'html') continue;
    for (const href of normalized.extraction.links ?? []) {
      const candidate = crawlCandidate(href, resolved, acceptedOrigin);
      if (!candidate || queued.has(candidate) || visited.has(candidate)) continue;
      queued.add(candidate);
      queue.push(candidate);
      if (queued.size >= maxPages * 8) break;
    }
  }
  return sources;
}
