#!/usr/bin/env node
/**
 * Assemble the human review packet for a genuine-business acceptance run.
 *
 * It fills in everything the durable factory state can prove and leaves the
 * product review and the manual-edit count for a person. The draft it writes
 * deliberately does not validate: an unreviewed run must not be able to pass by
 * accident.
 *
 *   npm run acceptance:genuine-business:packet -- --project <projectId> --out <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { collectReviewPacket, writeReviewPacket } from './lib/review-packet.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const projectId = option('project');
const outDir = path.resolve(option('out') ?? `.tmp/review-packet-${projectId ?? 'unknown'}`);
const stateRoot = path.resolve(option('state-root') ?? process.env.APP_BUILDER_STATE_ROOT ?? '.app-builder/local/service');
const workspacesRoot = path.resolve(option('workspaces-root') ?? process.env.APP_BUILDER_WORKSPACES_ROOT ?? '.app-builder/local/workspaces');

if (!projectId) {
  console.error('Usage: node tooling/review-packet.mjs --project <projectId> [--out <dir>] [--state-root <dir>]');
  process.exit(2);
}
if (!fs.existsSync(stateRoot)) {
  console.error(`No factory state at ${stateRoot}. Point --state-root at the factory that ran the project.`);
  process.exit(2);
}

let factoryCommit = 'unknown';
try { factoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }

const store = new FactoryStore({ stateRoot });
const service = new FactoryService({ store, workspacesRoot, stateRoot });
try {
  const packet = collectReviewPacket({ service, projectId, factoryCommit, outDir });
  const { sourceNotes, renderedCaptures } = writeReviewPacket(service, packet);
  console.log(`Review packet: ${outDir}`);
  console.log(`- evidence.draft.json (${packet.evidence.sources.length} sources, ${Object.values(packet.evidence.journeys).filter((value) => value === 'passed').length} journeys evidenced)`);
  console.log('- REVIEW.md');
  if (renderedCaptures) console.log(`- rendered-evidence/ (${renderedCaptures} captures)`);
  for (const note of sourceNotes) console.log(`! ${note}`);
  if (packet.missing.length) {
    console.log('');
    console.log('This run cannot be validated yet:');
    for (const entry of packet.missing) console.log(`- ${entry}`);
  }
  console.log('');
  console.log('Left for a person, on purpose:');
  for (const entry of packet.awaitingAPerson) console.log(`- ${entry}`);
  process.exitCode = packet.missing.length ? 1 : 0;
} finally {
  await service.close();
  store.close();
}
