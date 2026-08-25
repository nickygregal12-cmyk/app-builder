import assert from 'node:assert/strict';
import test from 'node:test';
import { FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';

test('source governance mutation is explicitly approval-gated for autonomous tool callers', () => {
  const tool = FACTORY_TOOLS.find((item) => item.name === 'project.source.governance.update');
  assert.ok(tool);
  assert.equal(tool.mutating, true);
  assert.equal(tool.approvalRequired, true);
});
