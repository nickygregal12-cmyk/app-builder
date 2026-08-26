import assert from 'node:assert/strict';
import test from 'node:test';
import { captureInventory } from './lib/visual-review-report.mjs';

test('capture inventory preserves the evidence a remote reviewer needs', () => {
  const evidence = {
    captures: [
      {
        id: 'home-mobile',
        pageId: 'home',
        route: '/',
        viewport: 'mobile',
        state: { axis: 'viewport', state: 'default', risk: 'low', interaction: null, proves: 'The mobile home composition.' },
        file: 'captures/home-mobile.png',
        contentHash: 'a'.repeat(64),
        byteSize: 1234,
        elementRefs: ['page-home--hero'],
      },
      {
        id: 'contact-failed-enquiry-mobile',
        pageId: 'contact',
        route: '/contact',
        viewport: 'mobile',
        state: { axis: 'form-submission', state: 'failed-enquiry', risk: 'high', interaction: 'submit-invalid-enquiry', proves: 'The failed enquiry state is visibly usable.' },
        file: 'captures/contact-failed-enquiry-mobile.png',
        contentHash: 'b'.repeat(64),
        byteSize: 2345,
        elementRefs: ['page-contact--lead-form'],
      },
    ],
  };

  const inventory = captureInventory(evidence);
  assert.equal(inventory.length, 2);
  assert.deepEqual(inventory[1], evidence.captures[1]);
  assert.notEqual(inventory[1], evidence.captures[1], 'the report receives a detached summary rather than a live evidence object');
  assert.notEqual(inventory[1].state, evidence.captures[1].state);
  assert.notEqual(inventory[1].elementRefs, evidence.captures[1].elementRefs);
  assert.equal(inventory.some((entry) => entry.state.axis !== 'viewport'), true, 'interaction-state captures must not disappear from the portable report');
});

test('capture inventory is empty when no rendered evidence exists', () => {
  assert.deepEqual(captureInventory(null), []);
  assert.deepEqual(captureInventory({ captures: [] }), []);
});
