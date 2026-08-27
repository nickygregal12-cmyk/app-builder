/**
 * Coverage for the two security-gate producers.
 *
 * Both normalise somebody else's output into one check id, which is the part
 * that can quietly go wrong: a scanner grows a rule, the registry does not know
 * about it, and the new rule fails nothing while looking like it works. So the
 * normalisation is what is tested here — every rule the scanner can emit must
 * arrive under the one id the gate fails on — alongside the planted failures.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanRepository, scanText } from './lib/secret-scan.mjs';
import {
  BLOCKING_ADVISORY_SEVERITIES,
  SECURITY_CHECKS,
  auditCommittedSecrets,
  auditDependencyAdvisories,
} from './lib/security-evidence.mjs';

const BUILD = 'composition-hash-1';

test('a clean build reports clean, and says how much it read', () => {
  const report = auditCommittedSecrets({ findings: [], filesScanned: 47, compositionHash: BUILD });
  assert.equal(report.clean, true);
  assert.equal(report.filesScanned, 47);
  assert.equal(report.compositionHash, BUILD);
  assert.deepEqual(report.findings, []);
});

test('a planted credential in a generated repository fails, wherever the scanner found it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-secret-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  // A tracked .env is one of the scanner's own rules and needs no invented
  // secret to trigger, so this plants a real defect rather than a fixture.
  fs.writeFileSync(path.join(root, '.env'), 'SUPABASE_URL=https://example.supabase.co\n');
  fs.writeFileSync(path.join(root, 'src/app.ts'), 'export const ok = true;\n');

  const findings = scanRepository(root);
  assert.ok(findings.length > 0, 'the scanner must find the tracked .env for this to be proving anything');

  const report = auditCommittedSecrets({ findings, filesScanned: 2, compositionHash: BUILD });
  assert.equal(report.clean, false);
  assert.deepEqual([...new Set(report.findings.map((entry) => entry.check))], ['committed-credential']);
  assert.match(report.findings[0].where, /^\.env:\d+$/);
  assert.ok(report.findings[0].rule, 'the scanner rule travels beside the check id rather than being lost to it');
  fs.rmSync(root, { recursive: true, force: true });
});

test('every rule the scanner can emit arrives under the one id the gate fails on', () => {
  // The failure this prevents: a scanner rule is added, the registry never
  // hears about it, and the new rule reports nothing the gate reads.
  // Assembled at run time rather than written out, so this file does not itself
  // contain a line the repository's own credential scan would report. The
  // scanner's fixture marker would suppress the line here, and a suppressed
  // line cannot also be a sample.
  const samples = [
    `const key = "sk-ant-api03-${'a'.repeat(40)}";`,
    `AWS_SECRET_ACCESS_KEY=${'AKIA'}${'IOSFODNN7EXAMPLE'}`,
    `${'ghp'}_${'b'.repeat(36)}`,
  ];
  const emitted = samples.flatMap((sample) => scanText(sample));
  assert.ok(emitted.length > 0, 'no sample matched any rule, so this test proves nothing');
  const report = auditCommittedSecrets({ findings: emitted.map((entry) => ({ ...entry, file: 'src/x.ts' })), filesScanned: 1 });
  assert.deepEqual([...new Set(report.findings.map((entry) => entry.check))], ['committed-credential']);
  assert.equal(report.findings.length, emitted.length, 'normalisation must not drop a finding');
});

test('a line the scanner marks as a fixture is not a finding', () => {
  const marked = scanText(`const key = "sk-ant-api03-${'a'.repeat(40)}"; // ${'not-a-real'}-credential`);
  assert.deepEqual(marked, []);
});

test('a clean audit says how many dependencies it was clean over', () => {
  const report = auditDependencyAdvisories({
    report: { vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, dependencies: { total: 390 } } },
    compositionHash: BUILD,
  });
  assert.equal(report.clean, true);
  assert.equal(report.dependencies, 390);
  assert.equal(report.reportedNotBlocking, 0);
});

test('a high or critical advisory fails; below that is reported and does not block', () => {
  const build = (severity) => auditDependencyAdvisories({
    report: {
      vulnerabilities: { 'some-lib': { severity, range: '<1.2.3', via: [{ title: 'Prototype pollution' }] } },
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 }, dependencies: { total: 12 } },
    },
    compositionHash: BUILD,
  });

  for (const severity of BLOCKING_ADVISORY_SEVERITIES) {
    const report = build(severity);
    assert.equal(report.clean, false, severity);
    assert.deepEqual(report.findings.map((entry) => entry.check), ['vulnerable-dependency']);
    assert.match(report.findings[0].where, /^some-lib@</);
    assert.match(report.findings[0].detail, /Prototype pollution/);
  }

  for (const severity of ['moderate', 'low', 'info']) {
    const report = build(severity);
    assert.equal(report.clean, true, severity);
    assert.equal(report.reportedNotBlocking, 1, 'a non-blocking advisory is counted rather than silently dropped');
  }
});

test('an audit report that says nothing is clean over nothing, and says so', () => {
  const report = auditDependencyAdvisories({ report: null, compositionHash: BUILD });
  assert.equal(report.clean, true);
  assert.equal(report.dependencies, 0, 'a pass over zero dependencies is visible in the coverage number');
});

test('every finding names a declared check with guidance a reader can act on', () => {
  for (const [id, rule] of Object.entries(SECURITY_CHECKS)) {
    assert.equal(rule.severity, 'blocker', id);
    assert.ok(rule.title?.trim(), id);
    assert.ok(rule.guidance?.length > 40, `${id} guidance must say what to do instead`);
  }
});
