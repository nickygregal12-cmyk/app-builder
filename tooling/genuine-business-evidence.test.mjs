import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateGenuineBusinessEvidence } from './lib/genuine-business-evidence.mjs';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function acceptanceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-genuine-business-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  function write(relative, content) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return sha256(content);
  }

  const sourceLogo = '<svg xmlns="http://www.w3.org/2000/svg"><text>approved</text></svg>';
  const manifest = '{"schemaVersion":2}\n';
  const knowledgePack = '{"schemaVersion":1}\n';
  const composition = '{"schemaVersion":1}\n';
  const verification = '{"checks":"passed"}\n';

  const sourceLogoHash = write('sources/company-logo.svg', sourceLogo);
  const manifestHash = write('artifacts/project-manifest.json', manifest);
  const knowledgePackHash = write('artifacts/knowledge-pack.json', knowledgePack);
  const compositionHash = write('artifacts/composition.json', composition);
  const verificationHash = write('artifacts/verification.json', verification);
  write('generated-app/package.json', '{"name":"generated-business"}\n');

  const evidence = {
    schemaVersion: 1,
    run: {
      id: 'run-real-business-001',
      startedAt: '2026-08-25T12:00:00.000Z',
      completedAt: '2026-08-25T12:05:00.000Z',
      factoryCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    business: {
      name: 'OpenAI',
      primaryUrl: 'https://openai.com/',
      projectType: 'marketing-site',
      synthetic: false,
    },
    sources: [
      {
        id: 'website-primary',
        kind: 'website',
        label: 'Existing company website',
        uri: 'https://openai.com/',
        provenance: 'existing-site',
        rightsStatus: 'reference-only',
      },
      {
        id: 'approved-logo',
        kind: 'logo',
        label: 'Approved company logo',
        uri: 'sources/company-logo.svg',
        sha256: sourceLogoHash,
        provenance: 'user-supplied',
        rightsStatus: 'approved-for-use',
      },
    ],
    journeys: {
      intake: 'passed',
      buildContract: 'passed',
      manifest: 'passed',
      ingest: 'passed',
      compose: 'passed',
      generate: 'passed',
      verify: 'passed',
      preview: 'passed',
      deploy: 'not-applicable',
    },
    manualEdits: {
      total: 2,
      targetMaximum: 20,
      entries: [
        { category: 'brand', description: 'Adjusted heading weight to supplied brand reference.', meaningful: true },
        { category: 'imagery', description: 'Replaced one unsuitable generated image with approved source material.', meaningful: true },
      ],
    },
    productReview: {
      launchable: true,
      reviewer: 'acceptance reviewer',
      notes: 'Representative product review passed.',
      checks: {
        factualAccuracy: 'passed',
        brandFit: 'passed',
        visualQuality: 'passed',
        responsiveQuality: 'passed',
        accessibility: 'passed',
      },
    },
    metrics: {
      aiCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costGbp: 0,
      elapsedMs: 300000,
      retries: 0,
      interventions: 2,
      qualityFailures: 0,
    },
    artifacts: {
      manifest: { path: 'artifacts/project-manifest.json', sha256: manifestHash },
      knowledgePack: { path: 'artifacts/knowledge-pack.json', sha256: knowledgePackHash },
      composition: { path: 'artifacts/composition.json', sha256: compositionHash },
      generatedRepository: { path: 'generated-app' },
      verificationReport: { path: 'artifacts/verification.json', sha256: verificationHash },
    },
    observedShortcomings: {
      brandAssets: [],
      genericDesign: [],
      imageGaps: [],
      copyMessaging: [],
      responsiveVisual: [],
      other: [],
    },
  };
  const evidenceFile = path.join(root, 'evidence.json');
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
  return { evidence, evidenceFile, root };
}

test('genuine business evidence accepts a complete source-backed product proof', (t) => {
  const { evidence, evidenceFile } = acceptanceFixture(t);
  assert.deepEqual(validateGenuineBusinessEvidence(evidence, { evidenceFile }), []);
});

test('synthetic/example websites can never satisfy the genuine-business gate', (t) => {
  const { evidence, evidenceFile } = acceptanceFixture(t);
  evidence.business.primaryUrl = 'https://acme.example/';
  evidence.sources[0].uri = 'https://acme.example/';
  const errors = validateGenuineBusinessEvidence(evidence, { evidenceFile });
  assert.ok(errors.some((error) => error.includes('real public HTTP(S) URL')));
  assert.ok(errors.some((error) => error.includes('website source website-primary is not a real public URL')));
});

test('the initial product-proof target is strictly fewer than twenty meaningful edits', (t) => {
  const { evidence, evidenceFile } = acceptanceFixture(t);
  evidence.manualEdits.entries = Array.from({ length: 20 }, (_, index) => ({
    category: 'other',
    description: `Meaningful edit ${index + 1}`,
    meaningful: true,
  }));
  evidence.manualEdits.total = evidence.manualEdits.entries.length;
  const errors = validateGenuineBusinessEvidence(evidence, { evidenceFile });
  assert.ok(errors.some((error) => error.includes('must be fewer than 20')));
});

test('the gate requires approved user-supplied business material', (t) => {
  const { evidence, evidenceFile } = acceptanceFixture(t);
  evidence.sources[1].rightsStatus = 'reference-only';
  const errors = validateGenuineBusinessEvidence(evidence, { evidenceFile });
  assert.ok(errors.some((error) => error.includes('user-supplied document/logo/image/spreadsheet approved for use')));
});

test('artifact hashes make recorded product proof tamper evident', (t) => {
  const { evidence, evidenceFile, root } = acceptanceFixture(t);
  fs.writeFileSync(path.join(root, evidence.artifacts.composition.path), '{"tampered":true}\n');
  const errors = validateGenuineBusinessEvidence(evidence, { evidenceFile });
  assert.ok(errors.some((error) => error.includes('artifacts.composition.sha256 does not match')));
});

test('a run is not refused because the factory still produces builds with known findings', (t) => {
  // Phase 3.8E exists to discover where the factory actually stands. Gating the proof on a
  // blocker-free build would make it unrunnable while the factory is still being built, and would
  // reward omitting the field over recording it honestly. Launch readiness is evidence, not a gate.
  const { evidence, evidenceFile } = acceptanceFixture(t);
  evidence.launchReadiness = {
    predictedManualEdits: 26,
    blockersAtHandover: 4,
    evidenceGaps: 31,
    reportPath: null,
  };
  assert.deepEqual(validateGenuineBusinessEvidence(evidence, { evidenceFile }), []);
});

test('launch readiness stays optional, so an early run can omit it entirely', (t) => {
  const { evidence, evidenceFile } = acceptanceFixture(t);
  delete evidence.launchReadiness;
  assert.deepEqual(validateGenuineBusinessEvidence(evidence, { evidenceFile }), []);
});
