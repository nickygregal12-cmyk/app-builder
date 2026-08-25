#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { assertKnowledgePack, buildKnowledgePack, inferSourceKind, normalizeSource, normalizeWebsite } from '../packages/content-intelligence/src/index.js';

function usage() {
  console.log('Usage: npm run ingest -- --input <file-or-url> [--input <file-or-url> ...] --out <directory> [--cache <directory>] [--purpose <text>] [--max-pages <1-25>]');
}

function parseArgs(argv) {
  const result = { inputs: [], maxPages: 12 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') result.inputs.push(argv[++index]);
    else if (value === '--out') result.out = argv[++index];
    else if (value === '--cache') result.cache = argv[++index];
    else if (value === '--purpose') result.purpose = argv[++index];
    else if (value === '--max-pages') result.maxPages = Number(argv[++index]);
    else if (value === '--help' || value === '-h') result.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return result;
}

function localSource(input, purpose) {
  const filePath = path.resolve(input);
  const source = { filePath, name: path.basename(filePath), label: path.basename(filePath), provenance: 'user-supplied', purpose: purpose ?? null };
  return { ...source, kind: inferSourceKind(source) };
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.uri ?? ''}::${source.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); process.exit(0); }
  if (!args.inputs.length || !args.out) { usage(); process.exit(2); }
  if (!Number.isInteger(args.maxPages) || args.maxPages < 1 || args.maxPages > 25) throw new Error('--max-pages must be an integer from 1 to 25.');
  const out = path.resolve(args.out);
  const cacheDir = path.resolve(args.cache ?? '.app-builder/cache/content');
  const assetOutputDir = path.join(out, 'assets');
  await fs.mkdir(out, { recursive: true });
  const normalized = [];
  for (const input of args.inputs) {
    const options = { cacheDir, assetOutputDir, assetUriPrefix: 'assets', maxPages: args.maxPages };
    if (/^https?:\/\//i.test(input)) normalized.push(...await normalizeWebsite(input, options));
    else normalized.push(await normalizeSource(localSource(input, args.purpose), options));
  }
  const sources = uniqueSources(normalized);
  const pack = assertKnowledgePack(buildKnowledgePack(sources));
  const chunkIndex = pack.chunks.map(({ id, contentHash, sourceIds, approxTokens }) => ({ id, contentHash, sourceIds, approxTokens }));
  const cacheIndex = sources.map(({ id, contentHash, cacheKey, extractorVersion }) => ({ id, contentHash, cacheKey, extractorVersion }));
  await fs.writeFile(path.join(out, 'normalized-sources.json'), JSON.stringify(sources, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'knowledge-pack.json'), JSON.stringify(pack, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'ai-context-index.json'), JSON.stringify(chunkIndex, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'source-cache-index.json'), JSON.stringify(cacheIndex, null, 2) + '\n');
  const cacheHits = sources.filter((source) => source.cacheHit).length;
  console.log(`Normalised ${sources.length} source(s) into ${out}. Cache hits: ${cacheHits}. Facts: ${pack.facts.length}. Assets: ${pack.assets.length}. AI-ready chunks: ${pack.chunks.length}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
