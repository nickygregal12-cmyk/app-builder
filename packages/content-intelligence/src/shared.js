import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTENT_INTELLIGENCE_VERSION = '1.1.0';
export const DEFAULT_LIMITS = Object.freeze({
  maxSourceBytes: 40 * 1024 * 1024,
  maxTextChars: 250_000,
  maxSpreadsheetRowsPerSheet: 500,
  maxSpreadsheetColumns: 60,
  remoteTimeoutMs: 15_000,
  maxRedirects: 5,
});

export const MIME_BY_EXT = Object.freeze({
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
});

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml', 'image/tiff']);

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function stableId(prefix, ...parts) {
  return `${prefix}-${sha256(parts.map((part) => String(part ?? '')).join('::')).slice(0, 16)}`;
}

export function clipText(value, maxChars) {
  const text = String(value ?? '').split(String.fromCharCode(0)).join('').trim();
  return { text: text.slice(0, maxChars), truncated: text.length > maxChars };
}

export function extensionFor(source = {}) {
  const raw = source.name ?? source.filePath ?? source.uri ?? '';
  try {
    if (/^https?:/i.test(raw)) return path.extname(new URL(raw).pathname).toLowerCase();
    if (/^file:/i.test(raw)) return path.extname(fileURLToPath(raw)).toLowerCase();
  } catch {
    return '';
  }
  return path.extname(String(raw)).toLowerCase();
}

export function isImageMime(mimeType) {
  return IMAGE_MIMES.has(mimeType);
}

export function inferSourceKind(source = {}) {
  if (source.kind) return source.kind;
  const ext = extensionFor(source);
  if (ext === '.pdf' || ext === '.docx' || ['.txt', '.md', '.json', '.html', '.htm'].includes(ext)) return 'document';
  if (ext === '.xlsx' || ext === '.csv') return 'spreadsheet';
  if (isImageMime(MIME_BY_EXT[ext])) {
    const label = String(source.label ?? source.name ?? source.filePath ?? '').toLowerCase();
    if (label.includes('logo')) return 'logo';
    if (label.includes('screenshot') || label.includes('screen-shot')) return 'screenshot';
    return 'image';
  }
  if (/^https?:/i.test(source.uri ?? '')) return 'url';
  return 'other';
}

export function inferMime(source, responseContentType) {
  const declared = String(source.mimeType ?? responseContentType ?? '').split(';')[0].trim().toLowerCase();
  return declared || MIME_BY_EXT[extensionFor(source)] || 'application/octet-stream';
}

function isPrivateIp(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
  }
  return false;
}

export function assertSafeRemoteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Unsupported remote protocol: ${url.protocol}`);
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isPrivateIp(hostname)) {
    throw new Error(`Refusing to fetch local/private URL: ${value}`);
  }
  return url;
}

async function assertPublicHostname(hostname, lookupImpl) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error(`Refusing to resolve local/private address: ${hostname}`);
    return;
  }
  const result = await lookupImpl(hostname, { all: true, verbatim: true });
  const records = Array.isArray(result) ? result : [result];
  if (!records.length) throw new Error(`No address records for ${hostname}.`);
  if (records.some((record) => isPrivateIp(record.address))) throw new Error(`Refusing to resolve ${hostname} to a local/private address.`);
}

async function readResponseBody(response, maxBytes) {
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced && announced > maxBytes) throw new Error(`Remote source exceeds ${maxBytes} bytes.`);
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error(`Remote source exceeds ${maxBytes} bytes.`);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('source-size-limit');
        throw new Error(`Remote source exceeds ${maxBytes} bytes.`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function fetchRemote(startUrl, limits, options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const lookupImpl = options.lookupImpl ?? dns.lookup;
  let current = assertSafeRemoteUrl(startUrl);
  for (let redirectCount = 0; redirectCount <= limits.maxRedirects; redirectCount += 1) {
    await assertPublicHostname(current.hostname, lookupImpl);
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(limits.remoteTimeoutMs),
      headers: { 'user-agent': 'AppBuilder-ContentIntelligence/1.1' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect from ${current} did not include a Location header.`);
      if (redirectCount === limits.maxRedirects) throw new Error(`Too many redirects while fetching ${startUrl}.`);
      current = assertSafeRemoteUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Failed to fetch ${current}: HTTP ${response.status}`);
    return {
      buffer: await readResponseBody(response, limits.maxSourceBytes),
      contentType: response.headers.get('content-type'),
      resolvedUri: current.toString(),
    };
  }
  throw new Error(`Too many redirects while fetching ${startUrl}.`);
}

export async function loadSourceBytes(source, limits, options = {}) {
  if (Buffer.isBuffer(source.data)) {
    if (source.data.length > limits.maxSourceBytes) throw new Error(`Source exceeds ${limits.maxSourceBytes} bytes.`);
    return { buffer: source.data, contentType: source.mimeType, resolvedUri: source.uri ?? null };
  }
  if (/^https?:/i.test(source.uri ?? '')) return fetchRemote(source.uri, limits, options);
  let filePath = source.filePath;
  if (!filePath && /^file:/i.test(source.uri ?? '')) filePath = fileURLToPath(source.uri);
  if (!filePath) throw new Error(`Source ${source.label ?? source.id ?? 'unknown'} has no readable filePath/uri/data.`);
  const stat = await fs.stat(filePath);
  if (stat.size > limits.maxSourceBytes) throw new Error(`Source exceeds ${limits.maxSourceBytes} bytes: ${filePath}`);
  return {
    buffer: await fs.readFile(filePath),
    contentType: source.mimeType,
    resolvedUri: source.uri ?? `file://${path.resolve(filePath)}`,
  };
}

export function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

export function stripHtml(value) {
  return decodeEntities(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAttributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}
