#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { buildKnowledgePack, inferSourceKind, normalizeSources } from '../packages/content-intelligence/src/index.js';

function usage() { console.log('Usage: npm run ingest -- --input <file-or-url> [--input <file-or-url> ...] --out <directory> [--cache <directory>] [--purpose <text>]'); }
function parseArgs(argv) { const result = { inputs: [] }; for (let index = 0; index < argv.length; index += 1) { const value = argv[index]; if (value === '--input') result.inputs.push(argv[++index]); else if (value === '--out') result.out = argv[++index]; else if (value === '--cache') result.cache = argv[++index]; else if (value === '--purpose') result.purpose = argv[++index]; else if (value === '--help' || value === '-h') result.help = true; else throw new Error(`Unknown argument: ${value}`); } return result; }
function sourceForInput(input, purpose) { if (/^https?:\/\//i.test(input)) return { uri: input, label: input, kind: 'url', provenance: 'existing-site', purpose: purpose ?? null }; const filePath = path.resolve(input); const source = { filePath, name: path.basename(filePath), label: path.basename(filePath), provenance: 'user-supplied', purpose: purpose ?? null }; return { ...source, kind: inferSourceKind(source) }; }

try {
  const args = parseArgs(process.argv.slice(2)); if (args.help) { usage(); process.exit(0); } if (!args.inputs.length || !args.out) { usage(); process.exit(2); }
  const out = path.resolve(args.out); const cacheDir = path.resolve(args.cache ?? '.app-builder/cache/content'); const assetOutputDir = path.join(out, 'assets'); await fs.mkdir(out, { recursive: true });
  const normalized = await normalizeSources(args.inputs.map((input) => sourceForInput(input, args.purpose)), { cacheDir, assetOutputDir, assetUriPrefix: 'assets' }); const pack = buildKnowledgePack(normalized);
  await fs.writeFile(path.join(out, 'normalized-sources.json'), JSON.stringify(normalized, null, 2) + '\n'); await fs.writeFile(path.join(out, 'knowledge-pack.json'), JSON.stringify(pack, null, 2) + '\n');
  const cacheHits = normalized.filter((source) => source.cacheHit).length; console.log(`Normalised ${normalized.length} source(s) into ${out}. Cache hits: ${cacheHits}. Facts: ${pack.facts.length}. Assets: ${pack.assets.length}.`);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
