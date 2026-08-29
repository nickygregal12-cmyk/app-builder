import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const status = JSON.parse(fs.readFileSync('config/factory-status.json', 'utf8'));
const roadmap = fs.readFileSync('docs/ROADMAP.md', 'utf8');

test('roadmap and machine status name the same active phase', () => {
  assert.equal(status.status, 'active');
  assert.match(status.currentStage, new RegExp(`Phase ${status.currentPhase.replace('.', '\\.')}`));
  assert.match(roadmap, new RegExp(`\\*\\*Phase ${status.currentPhase.replace('.', '\\.')}[^\n]*Active\\.\\*\\*`));
});

test('every machine-readable active outcome is represented in the sequencing authority', () => {
  const expectedHeadings = {
    'quality-truth-closure': 'Outcome A — quality truth closure',
    'second-genuine-business-proof': 'Outcome B — second genuine-business proof',
    'bounded-serious-application-benchmark': 'Outcome C — bounded serious-application benchmark',
    'accepted-build-release-lifecycle': 'Outcome D — accepted build to release',
  };
  for (const outcome of status.activeWork) {
    assert.ok(expectedHeadings[outcome], `active outcome ${outcome} has no deterministic roadmap mapping`);
    assert.match(roadmap, new RegExp(`^### ${expectedHeadings[outcome]}$`, 'm'));
  }
});

test('unpaid deferred gates cannot also be completed', () => {
  for (const entry of status.deferredCapabilities.filter((item) => item.unpaidGate)) {
    assert.ok(!status.completedStages.includes(entry.stage), `${entry.stage} is both unpaid and complete`);
  }
});
