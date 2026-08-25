#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';

const root = process.cwd();
let failed = false;
const required = [
  'apps/service/package.json',
  'apps/service/src/server.js',
  'apps/service/src/store.js',
  'apps/service/src/factory-service.js',
  'apps/service/src/http.js',
  'apps/service/src/tool-contract.js',
  'apps/service/src/ingestion.js',
  'tooling/service-ledger.test.mjs',
  'tooling/service-source-ingestion.test.mjs',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing factory service file: ${relative}`);
    failed = true;
  }
}

try {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!rootPackage.scripts?.service) {
    console.error('Root package must expose the factory service command.');
    failed = true;
  }
  if (!String(rootPackage.scripts?.doctor ?? '').includes('service-doctor.mjs')) {
    console.error('Root doctor must include the factory service boundary check.');
    failed = true;
  }

  const server = fs.readFileSync(path.join(root, 'apps/service/src/server.js'), 'utf8');
  if (!server.includes("'127.0.0.1'")) {
    console.error('Factory service must default to a loopback-only host.');
    failed = true;
  }

  const requiredTools = ['project.create', 'project.sources.ingest', 'project.sources.read', 'project.generate', 'project.verify', 'project.events.read', 'project.metrics.read', 'project.preview.start', 'project.preview.stop'];
  for (const name of requiredTools) {
    if (!FACTORY_TOOLS.some((tool) => tool.name === name)) {
      console.error(`Factory tool contract is missing ${name}.`);
      failed = true;
    }
  }
  if (FACTORY_TOOLS.some((tool) => /deploy|secret.*write|production/.test(tool.name))) {
    console.error('Factory tool contract must not expose production deployment or secret mutation operations.');
    failed = true;
  }

  // Ingestion accepts source material from a client, so the boundary that keeps
  // it from becoming an arbitrary file reader is worth asserting, not just
  // testing.
  const ingestion = fs.readFileSync(path.join(root, 'apps/service/src/ingestion.js'), 'utf8');
  if (!ingestion.includes('Sources cannot reference a filesystem path')) {
    console.error('Source ingestion must reject client-supplied filesystem paths.');
    failed = true;
  }
  if (!ingestion.includes('Only http(s) source URLs can be ingested.')) {
    console.error('Source ingestion must restrict remote sources to http(s) URLs.');
    failed = true;
  }

  for (const base of ['templates', 'recipes', 'adapters']) {
    const stack = [path.join(root, base)];
    while (stack.length) {
      const current = stack.pop();
      if (!current || !fs.existsSync(current)) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(?:json|js|mjs|ts|tsx|md)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (text.includes('@app-builder/service') || text.includes('apps/service')) {
            console.error(`Generated-app service coupling detected: ${path.relative(root, full)}`);
            failed = true;
          }
        }
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}

if (failed) process.exit(1);
console.log('Factory service doctor: local boundary, safe tool surface and generated-app portability are valid.');
