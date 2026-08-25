import path from 'node:path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';
import { clipText, extensionFor, inferSourceKind, isImageMime, MIME_BY_EXT, parseAttributes, sha256, stripHtml } from './shared.js';

function parseJsonLd(html) {
  const values = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) values.push(...parsed); else values.push(parsed);
    } catch {
      // Invalid JSON-LD is recorded indirectly by omission; raw HTML remains source evidence.
    }
  }
  return values.slice(0, 30);
}

function jsonLdTypes(values) {
  const types = [];
  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const raw = value['@type'];
    for (const item of Array.isArray(raw) ? raw : [raw]) if (typeof item === 'string' && !types.includes(item)) types.push(item);
  }
  return types;
}

function extractHtml(html, limits) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]) : '';
  let description = '';
  let canonical = '';
  const openGraph = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = parseAttributes(tag);
    const name = (attr.name ?? '').toLowerCase();
    const property = (attr.property ?? '').toLowerCase();
    if (name === 'description') description = attr.content ?? '';
    if (property.startsWith('og:') && attr.content) openGraph[property.slice(3)] = attr.content;
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = parseAttributes(tag);
    if ((attr.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')) canonical = attr.href ?? '';
  }
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({ level: Number(match[1]), text: stripHtml(match[2]) }))
    .filter((item) => item.text);
  const links = (html.match(/<a\b[^>]*>/gi) ?? []).map((tag) => parseAttributes(tag).href).filter(Boolean);
  const images = (html.match(/<img\b[^>]*>/gi) ?? [])
    .map((tag) => {
      const attr = parseAttributes(tag);
      return { src: attr.src, alt: attr.alt ?? '' };
    })
    .filter((item) => item.src);
  const colors = [...new Set((html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((value) => value.toLowerCase()))].slice(0, 40);
  const fontFamilies = [...new Set([...html.matchAll(/font-family\s*:\s*([^;}]+)/gi)]
    .map((match) => match[1].trim().replace(/^['"]|['"]$/g, '')))].slice(0, 20);
  const structuredData = parseJsonLd(html);
  const clipped = clipText(stripHtml(html), limits.maxTextChars);
  return {
    type: 'html',
    text: clipped.text,
    truncated: clipped.truncated,
    headings,
    links: links.slice(0, 500),
    images: images.slice(0, 500),
    structuredData,
    metadata: { title, description, canonical, colors, fontFamilies, openGraph, jsonLdTypes: jsonLdTypes(structuredData) },
  };
}

function parseCsv(text, limits) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length && rows.length < limits.maxSpreadsheetRowsPerSheet; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      if (row.length < limits.maxSpreadsheetColumns) row.push(cell);
      cell = '';
    } else if (char === '\n') {
      if (row.length < limits.maxSpreadsheetColumns) row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if ((cell || row.length) && rows.length < limits.maxSpreadsheetRowsPerSheet) {
    if (row.length < limits.maxSpreadsheetColumns) row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

async function extractPdf(buffer, limits) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const clipped = clipText(result.text ?? '', limits.maxTextChars);
    return { type: 'pdf', text: clipped.text, truncated: clipped.truncated, metadata: { pages: result.total ?? result.pages?.length ?? null } };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer, limits) {
  const [raw, semantic] = await Promise.all([mammoth.extractRawText({ buffer }), mammoth.convertToHtml({ buffer })]);
  const clipped = clipText(raw.value ?? '', limits.maxTextChars);
  const headings = [...String(semantic.value ?? '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({ level: Number(match[1]), text: stripHtml(match[2]) }))
    .filter((item) => item.text);
  const warnings = [...(raw.messages ?? []), ...(semantic.messages ?? [])].map((item) => item.message).slice(0, 30);
  return { type: 'docx', text: clipped.text, truncated: clipped.truncated, headings, metadata: { warnings } };
}

async function extractWorkbook(buffer, limits) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];
  for (const worksheet of workbook.worksheets) {
    const rows = [];
    const maxRows = Math.min(worksheet.rowCount, limits.maxSpreadsheetRowsPerSheet);
    const maxColumns = Math.min(worksheet.columnCount, limits.maxSpreadsheetColumns);
    for (let rowIndex = 1; rowIndex <= maxRows; rowIndex += 1) {
      const row = [];
      let nonEmpty = false;
      for (let columnIndex = 1; columnIndex <= maxColumns; columnIndex += 1) {
        const text = worksheet.getRow(rowIndex).getCell(columnIndex).text ?? '';
        row.push(text);
        if (text !== '') nonEmpty = true;
      }
      if (nonEmpty) rows.push(row);
    }
    sheets.push({ name: worksheet.name, rows, truncated: worksheet.rowCount > maxRows || worksheet.columnCount > maxColumns });
  }
  const text = sheets.flatMap((sheet) => [`[${sheet.name}]`, ...sheet.rows.map((row) => row.join('\t'))]).join('\n');
  const clipped = clipText(text, limits.maxTextChars);
  return { type: 'xlsx', text: clipped.text, truncated: clipped.truncated || sheets.some((sheet) => sheet.truncated), tables: sheets, metadata: { sheetCount: sheets.length } };
}

async function extractImage(buffer) {
  const [metadata, stats, fingerprintBytes] = await Promise.all([
    sharp(buffer, { failOn: 'warning' }).rotate().metadata(),
    sharp(buffer).rotate().stats(),
    sharp(buffer).rotate().resize(16, 16, { fit: 'fill' }).grayscale().raw().toBuffer(),
  ]);
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;
  const dominantColor = stats.dominant
    ? `#${[stats.dominant.r, stats.dominant.g, stats.dominant.b].map((part) => part.toString(16).padStart(2, '0')).join('')}`
    : null;
  return {
    type: 'image',
    text: '',
    truncated: false,
    metadata: {
      width,
      height,
      format: metadata.format ?? null,
      channels: metadata.channels ?? null,
      hasAlpha: metadata.hasAlpha ?? false,
      aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
      dominantColor,
      visualFingerprint: sha256(fingerprintBytes),
      lowResolution: Boolean(width && height && (width < 800 || height < 600)),
    },
  };
}

export async function extractBuffer(buffer, mimeType, source, limits) {
  const ext = extensionFor(source);
  if (mimeType === 'application/pdf' || ext === '.pdf') return extractPdf(buffer, limits);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') return extractDocx(buffer, limits);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === '.xlsx') return extractWorkbook(buffer, limits);
  if (mimeType === 'text/csv' || ext === '.csv') {
    const rows = parseCsv(buffer.toString('utf8'), limits);
    const clipped = clipText(rows.map((row) => row.join('\t')).join('\n'), limits.maxTextChars);
    return { type: 'csv', text: clipped.text, truncated: clipped.truncated, tables: [{ name: 'CSV', rows, truncated: false }], metadata: { rowCount: rows.length } };
  }
  if (mimeType === 'text/html' || ['.html', '.htm'].includes(ext) || inferSourceKind(source) === 'url') return extractHtml(buffer.toString('utf8'), limits);
  if (isImageMime(mimeType) || isImageMime(MIME_BY_EXT[ext])) return extractImage(buffer);
  if (mimeType === 'application/json' || ext === '.json') {
    const raw = buffer.toString('utf8');
    let structuredData = null;
    try { structuredData = JSON.parse(raw); } catch { structuredData = null; }
    const clipped = clipText(structuredData ? JSON.stringify(structuredData, null, 2) : raw, limits.maxTextChars);
    return { type: 'json', text: clipped.text, truncated: clipped.truncated, structuredData, metadata: {} };
  }
  if (mimeType.startsWith('text/') || ['.txt', '.md'].includes(ext)) {
    const clipped = clipText(buffer.toString('utf8'), limits.maxTextChars);
    return { type: ext === '.md' ? 'markdown' : 'text', text: clipped.text, truncated: clipped.truncated, metadata: {} };
  }
  return { type: 'binary', text: '', truncated: false, metadata: { note: 'Indexed as binary; no deterministic extractor is registered.' } };
}

export async function materializeImageVariants(buffer, contentHash, options) {
  if (!options.assetOutputDir) return [];
  await options.fs.mkdir(options.assetOutputDir, { recursive: true });
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return [];
  const variants = [];
  const widths = [...new Set([480, 960, 1600].filter((candidate) => candidate <= width).concat(Math.min(width, 1600)))].sort((a, b) => a - b);
  for (const targetWidth of widths) {
    for (const format of ['webp', 'avif']) {
      const filename = `${contentHash.slice(0, 16)}-${targetWidth}.${format}`;
      let pipeline = sharp(buffer).rotate().resize({ width: targetWidth, withoutEnlargement: true });
      pipeline = format === 'webp' ? pipeline.webp({ quality: 82 }) : pipeline.avif({ quality: 55 });
      await pipeline.toFile(path.join(options.assetOutputDir, filename));
      variants.push({ role: 'responsive', format, width: targetWidth, uri: `${options.assetUriPrefix ?? 'assets'}/${filename}` });
    }
  }
  for (const [role, targetWidth, targetHeight] of [['hero-16x9', 1600, 900], ['card-4x3', 800, 600], ['square-1x1', 600, 600]]) {
    if (width < targetWidth || height < targetHeight) continue;
    const filename = `${contentHash.slice(0, 16)}-${role}.webp`;
    await sharp(buffer).rotate().resize(targetWidth, targetHeight, { fit: 'cover', position: 'attention' }).webp({ quality: 84 }).toFile(path.join(options.assetOutputDir, filename));
    variants.push({ role, format: 'webp', width: targetWidth, height: targetHeight, uri: `${options.assetUriPrefix ?? 'assets'}/${filename}`, reviewBeforePublish: true });
  }
  return variants;
}
