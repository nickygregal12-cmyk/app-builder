#!/usr/bin/env node
import path from 'node:path';

import { FactoryStore } from '../apps/service/src/store.js';

/**
 * Re-derive the read model from the authoritative ledger.
 *
 * `--check` reports what reconciliation would do without a rebuild, which is
 * what an operator wants first: a store that is already consistent should not
 * be rebuilt to find that out.
 *
 * What this rebuilds is exactly what the ledger is authoritative for. Projects,
 * tasks and checkpoints are written directly and are not projections of it, so
 * this deliberately does not claim to recover them. A command that implied a
 * recovery it cannot perform would be worse than one that says what it does.
 */
const args = process.argv.slice(2);
const check = args.includes('--check');
const stateRoot = path.resolve(args.find((argument) => !argument.startsWith('--')) ?? '.app-builder/state');

// `reconcile: false` so opening the store does not silently do the thing this
// command exists to report on.
const store = new FactoryStore({ stateRoot, reconcile: false });
try {
  const result = check ? store.reconcileProjection() : store.rebuildProjection();
  console.log(`State root:      ${stateRoot}`);
  console.log(`Ledger events:   ${result.ledgerEvents}`);
  console.log(`Mode:            ${result.mode}`);
  console.log(`Projected:       ${result.recovered}`);
  if (result.orphaned.length) {
    console.log(`Orphaned:        ${result.orphaned.length} event(s) name a project this store does not have.`);
    for (const orphan of result.orphaned.slice(0, 10)) console.log(`  - ${orphan.eventId} (${orphan.type}) -> ${orphan.projectId}`);
    console.log('  The projects table is separate durable state, not a projection of the ledger, so these are reported rather than invented.');
  }
  if (check && result.mode === 'already-consistent') console.log('The read model already equals the ledger. Nothing to rebuild.');
} finally {
  store.close();
}
