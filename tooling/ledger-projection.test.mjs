import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendEvent, createEvent } from '@app-builder/control-plane';
import { FactoryStore } from '../apps/service/src/store.js';

const NOW = '2026-08-26T00:00:00.000Z';

function roots() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-ledger-'));
}

function project(store, id = 'p1') {
  return store.upsertProject({ id, name: 'P', type: 'marketing-site', slug: id, state: 'draft', manifest: {}, createdAt: NOW, updatedAt: NOW });
}

function event(projectId, type, id) {
  return createEvent({ id, projectId, type, actor: 'test' }, NOW);
}

/**
 * The failure these tests exist for is silent, which is the worst kind.
 * `recordEvent` appends to the authoritative ledger and then inserts into
 * SQLite. A process that dies between those two statements leaves an event that
 * happened and a read model that has never heard of it — and before this,
 * reopening the store noticed nothing at all.
 */
test('a crash between the ledger append and the projection insert is recovered when the store is reopened', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    await store.recordEvent(event('p1', 'build.started', 'event-1'));

    // The crash: the append succeeded, the process died before the insert.
    await appendEvent(path.join(root, 'events.jsonl'), event('p1', 'build.completed', 'event-2'));
    assert.equal(store.listEvents('p1').length, 1, 'the projection is short, which is the state a crash leaves behind');
    store.close();

    const reopened = new FactoryStore({ stateRoot: root });
    assert.equal(reopened.reconciliation.mode, 'replayed');
    assert.equal(reopened.reconciliation.replayedFrom, 2, 'Stage Q11: ledger at 2 and projection at 1 replays event 2, rather than scanning the whole ledger');
    assert.equal(reopened.reconciliation.recovered, 1);
    assert.deepEqual(reopened.listEvents('p1').map((entry) => entry.id), ['event-1', 'event-2']);
    assert.equal(reopened.metrics('p1').eventCount, 2, 'every cost total and resume packet was short by one until this ran');
    reopened.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reconciling a consistent store changes nothing and says so', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    await store.recordEvent(event('p1', 'build.started', 'event-1'));
    assert.equal(store.reconcileProjection().mode, 'already-consistent');
    assert.equal(store.reconcileProjection().recovered, 0, 'reconciliation is idempotent, or the recovery path is the thing that needs recovering');
    assert.equal(store.listEvents('p1').length, 1);
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a gap in the middle is rebuilt rather than appended, so sequence order still matches ledger order', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    for (const id of ['event-1', 'event-2', 'event-3']) await store.recordEvent(event('p1', 'build.step', id));

    // Lose the middle row from the read model only. Appending the missing event
    // would give it a sequence after event-3, which is exactly the wrong order.
    store.db.prepare('DELETE FROM events WHERE id = ?').run('event-2');
    const result = store.reconcileProjection();
    assert.equal(result.mode, 'rebuilt');
    assert.deepEqual(store.listEvents('p1').map((entry) => entry.id), ['event-1', 'event-2', 'event-3'], 'a rebuild restores ledger order, which a replay could not');
    const sequences = store.listEvents('p1').map((entry) => entry.sequence);
    assert.deepEqual([...sequences].sort((a, b) => a - b), sequences, 'sequence order is ledger order');
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a row the ledger does not have is not a projection of the ledger, and is rebuilt away', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    await store.recordEvent(event('p1', 'build.started', 'event-1'));
    store.projectEvent(event('p1', 'invented', 'event-ghost'));
    assert.equal(store.listEvents('p1').length, 2);

    assert.equal(store.reconcileProjection().mode, 'rebuilt');
    assert.deepEqual(store.listEvents('p1').map((entry) => entry.id), ['event-1']);
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rebuilding from the ledger is deterministic and repeatable', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    for (const id of ['event-1', 'event-2', 'event-3']) await store.recordEvent(event('p1', 'build.step', id));
    const before = store.listEvents('p1').map((entry) => ({ ...entry, sequence: undefined }));

    store.rebuildProjection();
    const once = store.listEvents('p1').map((entry) => ({ ...entry, sequence: undefined }));
    store.rebuildProjection();
    const twice = store.listEvents('p1').map((entry) => ({ ...entry, sequence: undefined }));

    assert.deepEqual(once, before, 'a rebuild reproduces what recording produced');
    assert.deepEqual(twice, once, 'rebuilding twice is rebuilding once');
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('projecting the same event twice is a no-op rather than a constraint failure', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    const entry = event('p1', 'build.started', 'event-1');
    await store.recordEvent(entry);
    store.projectEvent(entry);
    store.projectEvent(entry);
    assert.equal(store.listEvents('p1').length, 1);
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an event naming a project this store does not have is reported, not invented', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store, 'p1');
    await store.recordEvent(event('p1', 'build.started', 'event-1'));
    await appendEvent(path.join(root, 'events.jsonl'), event('p-gone', 'build.started', 'event-orphan'));
    store.close();

    const reopened = new FactoryStore({ stateRoot: root });
    assert.equal(reopened.reconciliation.recovered, 0);
    assert.deepEqual(reopened.reconciliation.orphaned, [{ eventId: 'event-orphan', projectId: 'p-gone', type: 'build.started', sequence: 2 }]);
    // The projects table is separate durable state, not a projection of the
    // ledger, so reconciliation surfaces the fact rather than fabricating a
    // project to satisfy a foreign key.
    assert.equal(reopened.getProject('p-gone'), null);
    reopened.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reconciliation can be opted out of, so the rebuild command can report before it acts', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    await store.recordEvent(event('p1', 'build.started', 'event-1'));
    await appendEvent(path.join(root, 'events.jsonl'), event('p1', 'build.completed', 'event-2'));
    store.close();

    const quiet = new FactoryStore({ stateRoot: root, reconcile: false });
    assert.equal(quiet.reconciliation, null);
    assert.equal(quiet.listEvents('p1').length, 1, 'opening without reconciling leaves the divergence visible to a --check run');
    assert.equal(quiet.reconcileProjection().recovered, 1);
    quiet.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an empty ledger and a fresh store are consistent, not broken', () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    assert.deepEqual(store.reconciliation, { mode: 'already-consistent', ledgerEvents: 0, replayedFrom: 1, recovered: 0, orphaned: [] });
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * The acceptance Stage Q11 names: delete the projection, rebuild it from the
 * ledger and prove the durable read state the *service* returns is unchanged.
 *
 * Deliberately through the service rather than the store. A rebuild that
 * restored rows but changed what a caller sees would satisfy a row-count
 * assertion and still have lost the thing the projection is for.
 */
test('deleting the projection and rebuilding it leaves the read state the service returns unchanged', async () => {
  const { FactoryService } = await import('../apps/service/src/factory-service.js');
  const root = roots();
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces'), stateRoot: path.join(root, 'state') });
  try {
    const created = service.createProject({
      id: 'project-rebuild',
      manifest: {
        schemaVersion: 2,
        project: { name: 'Rebuild', slug: 'rebuild', type: 'marketing-site', primaryGoal: 'Prove the projection is rebuildable.' },
        audience: { summary: 'Homeowners', roles: [] },
        journeys: ['Contact the business'],
        majorSurfaces: ['Home', 'Contact'],
        entities: [],
        company: { identity: { name: 'Rebuild' }, services: ['Painting'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
        modules: {},
        infrastructure: { backend: 'none', deployment: 'netlify' },
        aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
        brand: { designControl: 'sensible-defaults' },
        inputs: { inventory: [], sources: [] },
        constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
        outOfScope: [],
      },
    });
    await service.generateProject(created.id);

    const before = { events: store.listEvents(created.id), metrics: store.metrics(created.id) };
    assert.ok(before.events.length > 1, 'a real generation records several events, or this proves nothing');

    // The projection is gone. Not corrupted, not stale — gone.
    store.db.exec('DELETE FROM events');
    store.setLastProjectedSequence(0);
    assert.equal(store.listEvents(created.id).length, 0);


    const result = store.rebuildProjection();
    assert.equal(result.mode, 'replayed');
    assert.equal(result.recovered, before.events.length);

    const after = { events: store.listEvents(created.id), metrics: store.metrics(created.id) };
    assert.deepEqual(after.events, before.events, 'every event comes back with the same sequence and the same content');
    assert.deepEqual(after.metrics, before.metrics, 'and so does every total derived from them');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a rebuilt projection returns the same sequences, because a caller polls from one', async () => {
  const root = roots();
  try {
    const store = new FactoryStore({ stateRoot: root });
    project(store);
    for (const id of ['event-1', 'event-2', 'event-3', 'event-4']) await store.recordEvent(event('p1', 'build.step', id));

    const sequences = store.listEvents('p1').map((entry) => entry.sequence);
    assert.deepEqual(sequences, [1, 2, 3, 4], "the projection's sequence is the ledger's position");

    // `AUTOINCREMENT` never reuses a value, so a rebuild that did not reset the
    // counter would return the same four events as 5, 6, 7, 8 — and a Console
    // polling `listEvents(project, { afterSequence: 3 })` would be handed
    // everything again, or nothing, depending on which side of the shift it sat.
    store.rebuildProjection();
    assert.deepEqual(store.listEvents('p1').map((entry) => entry.sequence), [1, 2, 3, 4]);
    assert.deepEqual(store.listEvents('p1', { afterSequence: 3 }).map((entry) => entry.id), ['event-4'], 'incremental polling still means the same thing after a rebuild');
    store.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
