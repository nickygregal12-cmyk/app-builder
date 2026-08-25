import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';

export const CONTENT_INTELLIGENCE_VERSION = '1.0.0';
export const DEFAULT_LIMITS = Object.freeze({
  maxSourceBytes: 40 * 1024 * 1024,
  maxTextChars: 250_000,
  maxSpreadsheetRowsPerSheet: 500,
  maxSpreadsheetColumns: 60,
  remoteTimeoutMs: 15_000,
});

const MIME_BY_EXT = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.html': 'text/html', '.htm': 'text/html', '.json': 'application/json', '.csv': 'text/csv',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.tif': 'image/tiff', '.tiff': 'image/tiff',
};
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml', 'image/tiff']);

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stableId(prefix, ...parts) { return `${prefix}-${sha256(parts.map((part) => String(part ?? '')).join('\u001f')).slice(0, 16)}`; }
function clipText(value, maxChars) { const text = String(value ?? '').replace(/\u0000/g, '').trim(); return { text: text.slice(0, maxChars), truncated: text.length > maxChars }; }
function extensionFor(source) {
  const raw = source.name ?? source.filePath ?? source.uri ?? '';
  try { if (/^https?:/i.test(raw)) return path.extname(new URL(raw).pathname).toLowerCase(); if (/^file:/i.test(raw)) return path.extname(fileURLToPath(raw)).toLowerCase(); } catch {}
  return path.extname(String(raw)).toLowerCase();
}

export function inferSourceKind(source = {}) {
  if (source.kind) return source.kind;
  const ext = extensionFor(source);
  if (ext === '.pdf' || ext === '.docx' || ['.txt', '.md', '.json', '.html', '.htm'].includes(ext)) return 'document';
  if (ext === '.xlsx' || ext === '.csv') return 'spreadsheet';
  if (IMAGE_MIMES.has(MIME_BY_EXT[ext])) {
    const label = String(source.label ?? source.name ?? source.filePath ?? '').toLowerCase();
    if (label.includes('logo')) return 'logo';
    if (label.includes('screenshot') || label.includes('screen-shot')) return 'screenshot';
    return 'image';
  }
  if (/^https?:/i.test(source.uri ?? '')) return 'url';
  return 'other';
}
function inferMime(source, responseContentType) { const declared = String(source.mimeType ?? responseContentType ?? '').split(';')[0].trim().toLowerCase(); return declared || MIME_BY_EXT[extensionFor(source)] || 'application/octet-stream'; }
function isPrivateIp(hostname) {
  if (net.isIP(hostname) === 4) { const [a, b] = hostname.split('.').map(Number); return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0; }
  if (net.isIP(hostname) === 6) { const value = hostname.toLowerCase(); return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:'); }
  return false;
}
export function assertSafeRemoteUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Unsupported remote protocol: ${url.protocol}`);
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isPrivateIp(hostname)) throw new Error(`Refusing to fetch local/private URL: ${value}`);
  return url;
}
async function loadSourceBytes(source, limits) {
  if (Buffer.isBuffer(source.data)) { if (source.data.length > limits.maxSourceBytes) throw new Error(`Source exceeds ${limits.maxSourceBytes} bytes.`); return { buffer: source.data, contentType: source.mimeType, resolvedUri: source.uri }; }
  if (/^https?:/i.test(source.uri ?? '')) {
    const url = assertSafeRemoteUrl(source.uri);
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(limits.remoteTimeoutMs), headers: { 'user-agent': 'AppBuilder-ContentIntelligence/1.0' } });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    const announced = Number(response.headers.get('content-length') ?? 0);
    if (announced && announced > limits.maxSourceBytes) throw new Error(`Remote source exceeds ${limits.maxSourceBytes} bytes.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > limits.maxSourceBytes) throw new Error(`Remote source exceeds ${limits.maxSourceBytes} bytes.`);
    return { buffer, contentType: response.headers.get('content-type'), resolvedUri: response.url };
  }
  let filePath = source.filePath;
  if (!filePath && /^file:/i.test(source.uri ?? '')) filePath = fileURLToPath(source.uri);
  if (!filePath) throw new Error(`Source ${source.label ?? source.id ?? 'unknown'} has no readable filePath/uri/data.`);
  const stat = await fs.stat(filePath);
  if (stat.size > limits.maxSourceBytes) throw new Error(`Source exceeds ${limits.maxSourceBytes} bytes: ${filePath}`);
  return { buffer: await fs.readFile(filePath), contentType: source.mimeType, resolvedUri: source.uri ?? `file://${path.resolve(filePath)}` };
}
function decodeEntities(value) { return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))); }
function stripHtml(value) { return decodeEntities(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function attributes(tag) { const result = {}; for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''; return result; }
function extractHtml(html, limits) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i); const title = titleMatch ? stripHtml(titleMatch[1]) : ''; let description = ''; let canonical = '';
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) { const attr = attributes(tag); if ((attr.name ?? '').toLowerCase() === 'description') description = attr.content ?? ''; }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) { const attr = attributes(tag); if ((attr.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')) canonical = attr.href ?? ''; }
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({ level: Number(match[1]), text: stripHtml(match[2]) })).filter((item) => item.text);
  const links = (html.match(/<a\b[^>]*>/gi) ?? []).map((tag) => attributes(tag).href).filter(Boolean);
  const images = (html.match(/<img\b[^>]*>/gi) ?? []).map((tag) => { const attr = attributes(tag); return { src: attr.src, alt: attr.alt ?? '' }; }).filter((item) => item.src);
  const colors = [...new Set((html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((value) => value.toLowerCase()))].slice(0, 40);
  const fontFamilies = [...new Set([...html.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((match) => match[1].trim().replace(/^['"]|['"]$/g, '')))].slice(0, 20);
  const clipped = clipText(stripHtml(html), limits.maxTextChars);
  return { type: 'html', text: clipped.text, truncated: clipped.truncated, headings, links: links.slice(0, 500), images: images.slice(0, 500), metadata: { title, description, canonical, colors, fontFamilies } };
}
function parseCsv(text, limits) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length && rows.length < limits.maxSpreadsheetRowsPerSheet; index += 1) {
    const char = text[index];
    if (quoted) { if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char; continue; }
    if (char === '"') quoted = true; else if (char === ',') { if (row.length < limits.maxSpreadsheetColumns) row.push(cell); cell = ''; }
    else if (char === '\n') { if (row.length < limits.maxSpreadsheetColumns) row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += char;
  }
  if ((cell || row.length) && rows.length < limits.maxSpreadsheetRowsPerSheet) { if (row.length < limits.maxSpreadsheetColumns) row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
async function extractPdf(buffer, limits) { const parser = new PDFParse({ data: buffer }); try { const result = await parser.getText(); const clipped = clipText(result.text ?? '', limits.maxTextChars); return { type: 'pdf', text: clipped.text, truncated: clipped.truncated, metadata: { pages: result.total ?? result.pages?.length ?? null } }; } finally { await parser.destroy(); } }
async function extractDocx(buffer, limits) {
  const [raw, semantic] = await Promise.all([mammoth.extractRawText({ buffer }), mammoth.convertToHtml({ buffer })]); const clipped = clipText(raw.value ?? '', limits.maxTextChars);
  const headings = [...String(semantic.value ?? '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({ level: Number(match[1]), text: stripHtml(match[2]) })).filter((item) => item.text);
  return { type: 'docx', text: clipped.text, truncated: clipped.truncated, headings, metadata: { warnings: [...(raw.messages ?? []), ...(semantic.messages ?? [])].map((item) => item.message).slice(0, 30) } };
}
async function extractWorkbook(buffer, limits) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer); const sheets = [];
  for (const worksheet of workbook.worksheets) { const rows = []; const maxRows = Math.min(worksheet.rowCount, limits.maxSpreadsheetRowsPerSheet); const maxColumns = Math.min(worksheet.columnCount, limits.maxSpreadsheetColumns);
    for (let rowIndex = 1; rowIndex <= maxRows; rowIndex += 1) { const row = []; let nonEmpty = false; for (let columnIndex = 1; columnIndex <= maxColumns; columnIndex += 1) { const text = worksheet.getRow(rowIndex).getCell(columnIndex).text ?? ''; row.push(text); if (text !== '') nonEmpty = true; } if (nonEmpty) rows.push(row); }
    sheets.push({ name: worksheet.name, rows, truncated: worksheet.rowCount > maxRows || worksheet.columnCount > maxColumns }); }
  const text = sheets.flatMap((sheet) => [`[${sheet.name}]`, ...sheet.rows.map((row) => row.join('\t'))]).join('\n'); const clipped = clipText(text, limits.maxTextChars);
  return { type: 'xlsx', text: clipped.text, truncated: clipped.truncated || sheets.some((sheet) => sheet.truncated), tables: sheets, metadata: { sheetCount: sheets.length } };
}
async function extractImageCore(buffer) {
  const [metadata, stats, fingerprintBytes] = await Promise.all([sharp(buffer, { failOn: 'warning' }).rotate().metadata(), sharp(buffer).rotate().stats(), sharp(buffer).rotate().resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer()]);
  const width = metadata.width ?? null; const height = metadata.height ?? null; const dominant = stats.dominant ? `#${[stats.dominant.r, stats.dominant.g, stats.dominant.b].map((part) => part.toString(16).padStart(2, '0')).join('')}` : null;
  return { type: 'image', text: '', truncated: false, metadata: { width, height, format: metadata.format ?? null, channels: metadata.channels ?? null, hasAlpha: metadata.hasAlpha ?? false, aspectRatio: width && height ? Number((width / height).toFixed(4)) : null, dominantColor: dominant, visualFingerprint: sha256(fingerprintBytes), lowResolution: Boolean(width && height && (width < 800 || height < 600)) } };
}
async function extractBuffer(buffer, mimeType, source, limits) {
  const ext = extensionFor(source);
  if (mimeType === 'application/pdf' || ext === '.pdf') return extractPdf(buffer, limits);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') return extractDocx(buffer, limits);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === '.xlsx') return extractWorkbook(buffer, limits);
  if (mimeType === 'text/csv' || ext === '.csv') { const rows = parseCsv(buffer.toString('utf8'), limits); const clipped = clipText(rows.map((row) => row.join('\t')).join('\n'), limits.maxTextChars); return { type: 'csv', text: clipped.text, truncated: clipped.truncated, tables: [{ name: 'CSV', rows, truncated: false }], metadata: { rowCount: rows.length } }; }
  if (mimeType === 'text/html' || ['.html', '.htm'].includes(ext) || inferSourceKind(source) === 'url') return extractHtml(buffer.toString('utf8'), limits);
  if (IMAGE_MIMES.has(mimeType) || IMAGE_MIMES.has(MIME_BY_EXT[ext])) return extractImageCore(buffer);
  if (mimeType === 'application/json' || ext === '.json') { const raw = buffer.toString('utf8'); let json = null; try { json = JSON.parse(raw); } catch {} const clipped = clipText(json ? JSON.stringify(json, null, 2) : raw, limits.maxTextChars); return { type: 'json', text: clipped.text, truncated: clipped.truncated, structuredData: json, metadata: {} }; }
  if (mimeType.startsWith('text/') || ['.txt', '.md'].includes(ext)) { const clipped = clipText(buffer.toString('utf8'), limits.maxTextChars); return { type: ext === '.md' ? 'markdown' : 'text', text: clipped.text, truncated: clipped.truncated, metadata: {} }; }
  return { type: 'binary', text: '', truncated: false, metadata: { note: 'Indexed as binary; no deterministic extractor is registered.' } };
}
async function materializeImageVariants(buffer, contentHash, options) {
  if (!options.assetOutputDir) return []; await fs.mkdir(options.assetOutputDir, { recursive: true }); const metadata = await sharp(buffer).metadata(); const width = metadata.width ?? 0; const height = metadata.height ?? 0; if (!width || !height) return []; const variants = [];
  const widths = [...new Set([480, 960, 1600].filter((candidate) => candidate <= width).concat(Math.min(width, 1600)))].sort((a, b) => a - b);
  for (const targetWidth of widths) for (const format of ['webp', 'avif']) { const filename = `${contentHash.slice(0, 16)}-${targetWidth}.${format}`; let pipeline = sharp(buffer).rotate().resize({ width: targetWidth, withoutEnlargement: true }); pipeline = format === 'webp' ? pipeline.webp({ quality: 82 }) : pipeline.avif({ quality: 55 }); await pipeline.toFile(path.join(options.assetOutputDir, filename)); variants.push({ role: 'responsive', format, width: targetWidth, uri: `${options.assetUriPrefix ?? 'assets'}/${filename}` }); }
  for (const [role, targetWidth, targetHeight] of [['hero-16x9', 1600, 900], ['card-4x3', 800, 600], ['square-1x1', 600, 600]]) { if (width < targetWidth || height < targetHeight) continue; const filename = `${contentHash.slice(0, 16)}-${role}.webp`; await sharp(buffer).rotate().resize(targetWidth, targetHeight, { fit: 'cover', position: 'attention' }).webp({ quality: 84 }).toFile(path.join(options.assetOutputDir, filename)); variants.push({ role, format: 'webp', width: targetWidth, height: targetHeight, uri: `${options.assetUriPrefix ?? 'assets'}/${filename}`, reviewBeforePublish: true }); }
  return variants;
}
async function readCachedExtraction(cacheDir, cacheKey) { if (!cacheDir) return null; try { return JSON.parse(await fs.readFile(path.join(cacheDir, `${cacheKey}.json`), 'utf8')); } catch { return null; } }
async function writeCachedExtraction(cacheDir, cacheKey, extraction) { if (!cacheDir) return; await fs.mkdir(cacheDir, { recursive: true }); await fs.writeFile(path.join(cacheDir, `${cacheKey}.json`), JSON.stringify({ intelligenceVersion: CONTENT_INTELLIGENCE_VERSION, extraction }, null, 2) + '\n'); }
export async function normalizeSource(source, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) }; const loaded = await loadSourceBytes(source, limits); const mimeType = inferMime(source, loaded.contentType); const contentHash = sha256(loaded.buffer); const cacheKey = sha256(`${CONTENT_INTELLIGENCE_VERSION}:${mimeType}:${contentHash}`); const cached = await readCachedExtraction(options.cacheDir, cacheKey); const extraction = cached?.extraction ?? await extractBuffer(loaded.buffer, mimeType, source, limits); if (!cached) await writeCachedExtraction(options.cacheDir, cacheKey, extraction); const variants = extraction.type === 'image' ? await materializeImageVariants(loaded.buffer, contentHash, options) : []; const kind = inferSourceKind({ ...source, mimeType });
  return { id: source.id ?? stableId('source', source.label ?? source.name ?? loaded.resolvedUri ?? contentHash, contentHash), kind, label: String(source.label ?? source.name ?? loaded.resolvedUri ?? 'Source'), uri: loaded.resolvedUri, mimeType, sizeBytes: loaded.buffer.length, provenance: source.provenance ?? (kind === 'url' ? 'existing-site' : 'user-supplied'), purpose: source.purpose ?? null, contentHash, cacheKey, cacheHit: Boolean(cached), extractorVersion: CONTENT_INTELLIGENCE_VERSION, extraction, variants };
}
export async function normalizeSources(sources, options = {}) { const normalized = []; for (const source of sources) normalized.push(await normalizeSource(source, options)); return normalized; }
function pushFact(target, seen, fact) { const key = `${fact.path}\u001f${String(fact.value).toLowerCase()}`; if (seen.has(key)) return; seen.add(key); target.push({ id: stableId('fact', fact.path, fact.value), ...fact }); }
function simpleStructuredFacts(source, target, seen) { const data = source.extraction.structuredData; if (!data || Array.isArray(data) || typeof data !== 'object') return; const company = data.company && typeof data.company === 'object' ? data.company : data; for (const [factPath, value] of [['identity.name', company.name ?? company.companyName], ['contact.email', company.email], ['contact.phone', company.phone ?? company.telephone], ['contact.website', company.website ?? company.url], ['contact.address', company.address]]) { if (typeof value !== 'string' || !value.trim()) continue; pushFact(target, seen, { path: factPath, value: value.trim(), sourceId: source.id, provenance: source.provenance, confidence: source.provenance === 'user-supplied' ? 1 : 0.85, verification: source.provenance === 'user-supplied' ? 'user-provided' : 'candidate' }); } }
function contactFacts(source, target, seen) { const text = source.extraction.text ?? ''; for (const email of text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []) pushFact(target, seen, { path: 'contact.email', value: email, sourceId: source.id, provenance: source.provenance, confidence: 0.96, verification: 'candidate' }); for (const match of text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? []) { const digits = match.replace(/\D/g, ''); if (digits.length < 9 || digits.length > 15) continue; pushFact(target, seen, { path: 'contact.phone', value: match.replace(/\s+/g, ' ').trim(), sourceId: source.id, provenance: source.provenance, confidence: 0.82, verification: 'candidate' }); } }
export function buildKnowledgePack(normalizedSources, options = {}) {
  const facts = []; const seenFacts = new Set(); const content = []; const assets = []; const references = []; const requirements = []; const research = []; const colorMap = new Map(); const fontMap = new Map(); const titles = []; const exactAssets = new Map(); const visualAssets = new Map();
  for (const source of normalizedSources) {
    simpleStructuredFacts(source, facts, seenFacts); contactFacts(source, facts, seenFacts); const extraction = source.extraction;
    if (extraction.metadata?.title) { titles.push({ value: extraction.metadata.title, sourceId: source.id }); pushFact(facts, seenFacts, { path: 'identity.nameCandidate', value: extraction.metadata.title, sourceId: source.id, provenance: source.provenance, confidence: 0.55, verification: 'candidate' }); }
    for (const color of extraction.metadata?.colors ?? []) { const current = colorMap.get(color) ?? { value: color, sourceIds: [] }; if (!current.sourceIds.includes(source.id)) current.sourceIds.push(source.id); colorMap.set(color, current); }
    for (const font of extraction.metadata?.fontFamilies ?? []) { const current = fontMap.get(font) ?? { value: font, sourceIds: [] }; if (!current.sourceIds.includes(source.id)) current.sourceIds.push(source.id); fontMap.set(font, current); }
    if (extraction.type === 'image') { const asset = { id: stableId('asset', source.contentHash, source.id), sourceId: source.id, kind: source.kind, contentHash: source.contentHash, mimeType: source.mimeType, metadata: extraction.metadata, variants: source.variants }; if (exactAssets.has(source.contentHash)) asset.duplicateOf = exactAssets.get(source.contentHash); else exactAssets.set(source.contentHash, asset.id); const fingerprint = extraction.metadata?.visualFingerprint; if (!asset.duplicateOf && fingerprint && visualAssets.has(fingerprint)) asset.nearDuplicateOf = visualAssets.get(fingerprint); else if (fingerprint) visualAssets.set(fingerprint, asset.id); assets.push(asset); }
    else content.push({ id: stableId('content', source.id, extraction.type), sourceId: source.id, kind: extraction.type, text: extraction.text ?? '', headings: extraction.headings ?? [], tables: extraction.tables ?? [], metadata: extraction.metadata ?? {}, truncated: Boolean(extraction.truncated) });
    if (/^https?:/i.test(source.uri ?? '')) references.push({ id: stableId('reference', source.uri), type: 'source-url', value: source.uri, sourceId: source.id });
    for (const link of extraction.links ?? []) references.push({ id: stableId('reference', source.id, link), type: 'link', value: link, sourceId: source.id });
    for (const image of extraction.images ?? []) references.push({ id: stableId('reference', source.id, image.src), type: 'image-reference', value: image.src, label: image.alt || undefined, sourceId: source.id });
    if (/requirement|brief|scope/i.test(source.purpose ?? '')) requirements.push({ id: stableId('requirement', source.id), sourceId: source.id, text: extraction.text ?? '', provenance: source.provenance });
    if (extraction.type === 'html') research.push({ id: stableId('research', source.id, 'seo'), type: 'existing-site-seo-snapshot', sourceId: source.id, title: extraction.metadata?.title ?? '', description: extraction.metadata?.description ?? '', canonical: extraction.metadata?.canonical ?? '', headingCount: extraction.headings?.length ?? 0 });
  }
  const sources = normalizedSources.map(({ extraction, variants, ...source }) => ({ ...source, extractionSummary: { type: extraction.type, truncated: Boolean(extraction.truncated), cacheHit: source.cacheHit }, variantCount: variants.length }));
  const brand = { colors: [...colorMap.values()], fontFamilies: [...fontMap.values()], titles, logoCandidates: assets.filter((asset) => asset.kind === 'logo' || /logo/i.test(normalizedSources.find((source) => source.id === asset.sourceId)?.label ?? '')).map((asset) => asset.id) };
  const base = { schemaVersion: 1, intelligenceVersion: CONTENT_INTELLIGENCE_VERSION, project: options.project ?? null, sources, facts, brand, assets, content, references, requirements, research, generatedCopy: [] };
  return { ...base, packHash: sha256(JSON.stringify(base)) };
}
