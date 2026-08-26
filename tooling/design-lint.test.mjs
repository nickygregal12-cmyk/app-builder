import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateContract } from '@app-builder/contracts';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { MINIMUM_TEXT_CONTRAST, aiReviewCandidates, compileDesignLintReport, mixHex, templateTokenDefaults } from './lib/design-lint.mjs';
import { assertAccentColor, compileDesignSystemSpec, contrastRatio } from './lib/design-choices.mjs';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { buildEvidenceSet } from './lib/rendered-evidence.mjs';

const TOKENS_CSS = fs.readFileSync('templates/react-vite-neutral/files/src/design/tokens.css', 'utf8');
const LAYOUTS = JSON.parse(fs.readFileSync('config/layout-patterns.json', 'utf8'));

function projectManifest(type = 'marketing-site') {
  const manifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
  manifest.project.type = type;
  return manifest;
}

function build(type = 'marketing-site') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `app-builder-lint-${type}-`));
  const out = path.join(tmp, 'project');
  const { composition } = generateComposedProject(projectManifest(type), out, {});
  const spec = JSON.parse(fs.readFileSync(path.join(out, '.product/design-system.json'), 'utf8'));
  fs.rmSync(tmp, { recursive: true, force: true });
  return { spec, composition };
}

function lint({ spec, composition }) {
  return compileDesignLintReport({ spec, composition, tokenSourceCss: TOKENS_CSS, compositionHash: composition.compositionHash ?? null });
}

test('every canonical project type lints clean, so a rule cannot cry wolf on a good build', () => {
  for (const projectType of Object.keys(LAYOUTS.projectTypeDefaults)) {
    const report = lint(build(projectType));
    assert.equal(report.counts.violation, 0, `${projectType} raised ${JSON.stringify(report.findings)}`);
    assert.equal(report.counts.warning, 0, `${projectType} raised ${JSON.stringify(report.findings)}`);
    assert.equal(report.clean, true);
  }
});

test('an accent that fails on the ground it is printed on is caught before a browser opens', () => {
  const { spec, composition } = build();

  // #0066ff passes the design contract's own gate, which measures against
  // white. The ground an eyebrow actually sits on is 9% of the accent mixed
  // into the page, and that costs enough contrast to make it unreadable.
  assert.equal(assertAccentColor('#0066ff'), '#0066ff');
  const ground = mixHex('#0066ff', templateTokenDefaults(TOKENS_CSS)['--color-page'], 0.09);
  assert.ok(contrastRatio('#0066ff', ground) < MINIMUM_TEXT_CONTRAST);

  const report = lint({ spec: { ...spec, tokens: { ...spec.tokens, '--color-accent': '#0066ff' } }, composition });
  const failure = report.findings.find((entry) => entry.rule === 'accent-contrast');
  assert.ok(failure, 'the rule must catch what the input gate could not');
  assert.equal(failure.severity, 'violation');
  assert.equal(failure.ground, '--color-accent-soft');
  assert.ok(failure.ratio < MINIMUM_TEXT_CONTRAST);
  assert.equal(report.clean, false);

  // A build that never puts the accent on that ground is not held to it.
  const uniform = lint({
    spec: { ...spec, tokens: { ...spec.tokens, '--color-accent': '#0066ff', '--section-alt-ground': 'transparent' } },
    composition,
  });
  assert.equal(uniform.findings.some((entry) => entry.ground === '--color-accent-soft'), false);
});

test('reduced motion is an invariant a build cannot lint its way out of', () => {
  const { spec, composition } = build();
  assert.deepEqual(lint({ spec, composition }).findings.filter((entry) => entry.rule === 'reduced-motion-required'), []);

  const traded = { ...spec, artDirection: { ...spec.artDirection, motion: { ...spec.artDirection.motion, reducedMotionRequired: false } } };
  const report = compileDesignLintReport({ spec: traded, composition, tokenSourceCss: TOKENS_CSS });
  assert.equal(report.findings.filter((entry) => entry.rule === 'reduced-motion-required')[0].severity, 'violation');

  // The template losing its reduced-motion block is the same defect arriving
  // from the other direction.
  const stripped = compileDesignLintReport({ spec, composition, tokenSourceCss: TOKENS_CSS.replace(/@media \(prefers-reduced-motion: reduce\)/, '@media (min-width: 0px)') });
  assert.equal(stripped.findings.some((entry) => entry.rule === 'reduced-motion-required'), true);
});

test('a page that repeats itself, or asks for everything at once, is reported as a warning', () => {
  const { spec } = build();
  const section = (id, type, variant, actions = []) => ({ id, type, variant, actions, assetIds: [], bindings: [] });
  const composition = {
    compositionHash: 'hash-repetitive',
    pages: [{ id: 'page-home', path: '/', sectionIds: ['s1', 's2', 's3', 's4'] }],
    sections: [
      section('s1', 'item-grid', 'cards'),
      section('s2', 'item-grid', 'cards'),
      section('s3', 'item-grid', 'cards'),
      section('s4', 'item-grid', 'list'),
    ],
  };
  const repetitive = lint({ spec, composition }).findings.find((entry) => entry.rule === 'repetitive-section-presentation');
  assert.equal(repetitive.severity, 'warning');
  assert.deepEqual(repetitive.sectionIds, ['s1', 's2', 's3'], 'the run that repeats is named, not the whole page');

  // Two the same is a pair, not a pattern.
  const pair = { ...composition, pages: [{ id: 'page-home', path: '/', sectionIds: ['s1', 's2'] }] };
  assert.equal(lint({ spec, composition: pair }).findings.some((entry) => entry.rule === 'repetitive-section-presentation'), false);

  const shouting = {
    compositionHash: 'hash-actions',
    pages: [{ id: 'page-home', path: '/', sectionIds: ['a1', 'a2', 'a3'] }],
    sections: [
      section('a1', 'hero', 'primary', [{ label: 'Call', href: 'tel:1' }]),
      section('a2', 'item-grid', 'cards', [{ label: 'Email', href: 'mailto:a@b.c' }]),
      section('a3', 'cta', 'default', [{ label: 'Enquire', href: '/contact' }]),
    ],
  };
  const competing = lint({ spec, composition: shouting }).findings.find((entry) => entry.rule === 'competing-primary-actions');
  assert.equal(competing.severity, 'warning');
  assert.equal(competing.pageId, 'page-home');
});

test('taste is graded as a recommendation, and what needs judgement is handed on rather than guessed', () => {
  const { spec } = build('internal-tool');
  assert.equal(spec.artDirection.dimensions.layoutVariance, 'uniform');
  const composition = {
    compositionHash: 'hash-flat',
    pages: [{ id: 'page-home', path: '/', sectionIds: ['f1', 'f2', 'f3', 'f4', 'f5'] }],
    sections: ['f1', 'f2', 'f3', 'f4', 'f5'].map((id, index) => ({ id, type: index % 2 ? 'entity-list' : 'item-grid', variant: 'list', actions: [], assetIds: [], bindings: [] })),
  };
  const report = lint({ spec, composition });
  const rhythm = report.findings.find((entry) => entry.rule === 'uniform-page-rhythm');
  // A dense internal tool is deliberately flat, so ignoring this is a
  // legitimate outcome and it must never be graded as a defect.
  assert.equal(rhythm.severity, 'recommendation');
  assert.equal(report.clean, true, 'a recommendation must not fail a build');

  const candidates = aiReviewCandidates(spec, composition);
  assert.deepEqual(candidates.map((entry) => entry.id), ['brand-fit', 'visual-hierarchy', 'distinctiveness']);
  for (const candidate of candidates) assert.match(candidate.question, /\?$/);

  // Imagery is only worth a critic's attention where the build publishes any.
  const withAssets = { ...composition, sections: [{ ...composition.sections[0], assetIds: ['asset-1'] }, ...composition.sections.slice(1)] };
  assert.ok(aiReviewCandidates(spec, withAssets).some((entry) => entry.id === 'imagery-suitability'));
});

test('the report travels with rendered evidence and satisfies its contract', () => {
  const { spec, composition } = build();
  const report = lint({ spec, composition });
  const evidence = buildEvidenceSet({
    plan: { viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }], captures: [], uncovered: [] },
    results: [],
    projectId: 'project-lint',
    buildRef: '/workspaces/lint',
    compositionHash: composition.compositionHash,
    capturedAt: '2026-08-26T00:00:00.000Z',
    designLint: report,
  });
  assert.deepEqual(validateContract('rendered-evidence', evidence), []);
  assert.equal(evidence.designLint.clean, true);
  assert.equal(evidence.designLint.compositionHash, composition.compositionHash);

  // Evidence captured before any lint ran says so rather than implying clean.
  const without = buildEvidenceSet({
    plan: { viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }], captures: [], uncovered: [] },
    results: [],
    projectId: 'project-lint',
    buildRef: '/workspaces/lint',
    compositionHash: composition.compositionHash,
    capturedAt: '2026-08-26T00:00:00.000Z',
  });
  assert.deepEqual(validateContract('rendered-evidence', without), []);
  assert.equal(without.designLint, null);
  assert.notEqual(without.setHash, evidence.setHash, 'the report is part of what the evidence set hashes');
});

test('a compiled design is required; there is no lint without one', () => {
  assert.throws(() => compileDesignLintReport({ composition: { pages: [], sections: [] } }), /needs a compiled DesignSystemSpec/);
  assert.throws(() => compileDesignLintReport({ spec: { schemaVersion: 1 }, composition: { pages: [], sections: [] } }), /needs a compiled DesignSystemSpec/);

  // An empty build is clean, not an error.
  const empty = compileDesignLintReport({ spec: compileDesignSystemSpec({ patternId: 'public-marketing', accentColor: '#315b72', maxWidth: '72rem', radius: '1rem', density: 'comfortable' }), composition: { pages: [], sections: [] }, tokenSourceCss: TOKENS_CSS });
  assert.equal(empty.clean, true);
  assert.deepEqual(empty.findings, []);
});


test('the service lints a real build from its own workspace, without a browser', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-lint-service-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces'), stateRoot: path.join(root, 'state') });

  try {
    const project = service.createProject({ id: 'project-lint-service', manifest: projectManifest() });
    // A project with nothing built says so, rather than reporting a clean build
    // that does not exist.
    assert.equal(service.designLintReport(project.id), null);

    const generated = await service.generateProject(project.id);
    const report = service.designLintReport(project.id);
    assert.equal(report.authority, 'design-contract');
    assert.equal(report.clean, true, JSON.stringify(report.findings));
    assert.equal(report.compositionHash, generated.composition.compositionHash);
    assert.ok(report.aiReviewCandidates.length > 0);

    // This is the path evidence capture runs, so it must read the build's own
    // compiled spec and the template's own token source rather than the
    // factory's copies of either.
    const spec = JSON.parse(fs.readFileSync(path.join(generated.workspace, '.product/design-system.json'), 'utf8'));
    assert.deepEqual(report, compileDesignLintReport({
      spec,
      composition: generated.composition,
      tokenSourceCss: fs.readFileSync(path.join(generated.workspace, 'src/design/tokens.css'), 'utf8'),
      compositionHash: generated.composition.compositionHash,
    }));

    // A live design edit is linted against what the build now compiles.
    await service.writeDesignChoices(project.id, { accentColor: '#0066ff' });
    const afterEdit = service.designLintReport(project.id);
    assert.equal(afterEdit.clean, false, 'an accent that fails on its own ground must be caught without a rebuild');
    assert.equal(afterEdit.findings.find((entry) => entry.rule === 'accent-contrast').ground, '--color-accent-soft');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
