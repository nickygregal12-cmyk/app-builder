import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { assertContract, validateContract } from '@app-builder/contracts';
import { applyContentOverrides, applySectionVariants, assertEditableElement, assetDecisionsHash, bindingElementKey, composeProject, elementRef, resolveElementIdentity, stripContentOverrides, stripSectionVariants } from '@app-builder/composition';
import { createCheckpoint, createEvent, createTask, transitionTask } from '@app-builder/control-plane';
import { SourceIngestion, knowledgeSummary } from './ingestion.js';
import { bundleForReplayedRun, mintApprovedIntakeBundle, replayApprovedIntake } from './approved-intake.js';
import { reapplyAssetFocalPoints } from './asset-governance.js';
import { candidateRoot, installSharedDependencies, removeCandidateWorkspaces, serveCandidateBuild, verifyCandidate } from './visual-candidates.js';
import { designReferenceInfluence } from './visual-references.js';
import { generateComposedProject } from '../../../tooling/lib/composed-generator.mjs';
import { DESIGN_SYSTEM_SPEC_PATH, applyDesignChoices, assertDesignChoices, designControls, writeDesignArtifacts } from '../../../tooling/lib/design-choices.mjs';
import { applyEvidenceToStateMatrix, buildEvidenceSet, captureFile, deriveEvidencePlan } from '../../../tooling/lib/rendered-evidence.mjs';
import { compileDesignLintReport, templateTokenDefaults } from '../../../tooling/lib/design-lint.mjs';
import { compileAssetReadiness } from '../../../tooling/lib/asset-readiness.mjs';
import { applyVisualDirection, compileVisualDirection, loadVisualDirections, selectVisualDirections, structuralSignature } from '../../../tooling/lib/visual-direction.mjs';
import { validateBespokePresentation, writeBespokePresentation } from '../../../tooling/lib/bespoke-presentation.mjs';
import { buildCandidateSet, decideCandidateSet, loadVisualQualityGate, promoteCandidate, recordCandidateEvidence, recordReview, reviewCriteriaFor, summariseCandidateSet } from '../../../tooling/lib/visual-candidates.mjs';
import { attachRevisedCandidate, planVisualRework, remainingReworkBudget, reworkOverrides } from '../../../tooling/lib/visual-rework.mjs';
import { auditLaunchReadiness, deriveStateMatrix } from '../../../tooling/lib/launch-readiness.mjs';
import { deriveOpportunities } from '../../../tooling/lib/product-opportunities.mjs';
import { captureEvidence } from '../../../tooling/lib/rendered-evidence-capture.mjs';
import { validateManifest } from '../../../tooling/lib/manifest.mjs';
import { recordRecipeInstallations } from '../../../tooling/lib/recipe-upgrades.mjs';

function safeChild(root, name) {
  const base = path.resolve(root);
  const target = path.resolve(base, name);
  if (target === base || !target.startsWith(`${base}${path.sep}`)) throw new Error(`Unsafe workspace name: ${name}`);
  return target;
}

// Each build gets its own directory so a rebuild after new source material
// never overwrites the repository someone may already be reviewing. The first
// build keeps the plain slug; later builds are suffixed.
function nextWorkspace(root, slug, limit = 50) {
  for (let version = 1; version <= limit; version += 1) {
    const candidate = safeChild(root, version === 1 ? slug : `${slug}-v${version}`);
    if (!fs.existsSync(candidate)) return { workspace: candidate, version };
  }
  throw new Error(`Refusing to allocate more than ${limit} build workspaces for ${slug}.`);
}

function summary(project) {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    slug: project.slug,
    state: project.state,
    workspacePath: project.workspacePath,
    manifestVersion: project.manifest.schemaVersion ?? 1,
    knowledgePackHash: project.knowledgePack?.packHash ?? null,
    // The bundle itself is a large artifact, so a summary reports only that
    // this project can be rerun without re-keying the questionnaire.
    approvedIntakeBundleId: project.intakeBundle?.bundleId ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function commandFailure(command, args, result) {
  const status = result.status ?? 'unknown';
  const signal = result.signal ? ` (${result.signal})` : '';
  return new Error(`${command} ${args.join(' ')} failed with exit code ${status}${signal}.`);
}

function runCommand(command, args, cwd) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw commandFailure(command, args, result);
  return { durationMs: Date.now() - started };
}

async function freeLocalPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('Unable to allocate a local preview port.');
  return port;
}

// A project id is an opaque factory identifier, so it is encoded once here and
// this is the only place the operator-facing preview path is constructed.
function previewBasePath(projectId) {
  return `/preview/${encodeURIComponent(projectId)}/`;
}

async function waitForPreview(url, child, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Preview process exited before it became ready.');
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status > 0) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Preview process did not become ready before the timeout.');
}

function signalPreview(child, signal) {
  if (child.exitCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child if the process group already disappeared.
    }
  }
  child.kill(signal);
}

async function terminatePreview(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  signalPreview(child, 'SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))]);
  if (child.exitCode === null) {
    signalPreview(child, 'SIGKILL');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1000))]);
  }
}

/** The identity of a compiled artifact, so a candidate can be told apart from its sibling. */
function hashOf(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class FactoryService {
  constructor({ store, workspacesRoot, stateRoot, factoryRoot = process.cwd(), env = process.env }) {
    this.store = store;
    this.workspacesRoot = path.resolve(workspacesRoot);
    // Where the factory's own registries live. Generation already resolves them
    // from the working directory; naming it here lets a candidate run resolve
    // the same registries without depending on where the process was started.
    this.factoryRoot = path.resolve(factoryRoot);
    this.env = env;
    this.previews = new Map();
    this.ingestion = new SourceIngestion({ stateRoot: stateRoot ?? store.stateRoot });
    // Evidence is a record of what a build rendered, not part of the product,
    // so it lives in service state rather than inside the portable repository.
    this.evidenceRoot = path.resolve(stateRoot ?? store.stateRoot, 'evidence');
    fs.mkdirSync(this.workspacesRoot, { recursive: true });
  }

  /**
   * Record an approved intake so a rerun never asks the operator to remember
   * questionnaire answers. The service builds the contract and manifest itself,
   * so what is persisted is this factory's own output from those answers.
   */
  approveIntake(intake) {
    return mintApprovedIntakeBundle(intake ?? {});
  }

  /** The original bytes of an ingested upload, for handover and evidence. */
  readRetainedSource(projectId, contentHash) {
    this.requireProject(projectId);
    return this.ingestion.readRetainedOriginal(projectId, contentHash);
  }

  getIntakeBundle(projectId) {
    return this.requireProject(projectId).intakeBundle ?? null;
  }

  /**
   * Start a fresh run from an approved intake bundle.
   *
   * The bundle is validated, replayed through the ordinary contract builders
   * and refused outright if the questionnaire has moved underneath it. What
   * comes back is a new project in `ready` state with its own identity: no
   * workspace, no build, no evidence and no checkpoint is carried across, so
   * approved intent is reused and generated output never is.
   */
  async replayIntakeBundle(bundle) {
    const replayed = replayApprovedIntake(bundle);
    const project = this.createProject({
      manifest: replayed.projectManifest,
      intakeBundle: bundleForReplayedRun(bundle, replayed),
    });
    await this.store.recordEvent(createEvent({
      projectId: project.id,
      type: 'intake.replayed',
      actor: 'factory-service',
      payload: { fromBundleId: bundle.bundleId, reused: replayed.reused, drift: replayed.drift },
    }));
    return { project, reused: replayed.reused, drift: replayed.drift };
  }

  createProject({ manifest, knowledgePack = null, id = null, intakeBundle = null }) {
    const errors = validateManifest(manifest);
    if (errors.length) throw new Error(`Invalid project manifest: ${errors.join('; ')}`);
    if (knowledgePack) {
      const packErrors = validateContract('knowledge-pack', knowledgePack);
      if (packErrors.length) throw new Error(`Invalid knowledge pack: ${packErrors.join('; ')}`);
    }
    const now = new Date().toISOString();
    const project = this.store.upsertProject({
      id: id ?? `project-${randomUUID()}`,
      name: manifest.project.name,
      type: manifest.project.type,
      slug: manifest.project.slug,
      state: 'ready',
      workspacePath: null,
      manifest,
      knowledgePack,
      intakeBundle,
      createdAt: now,
      updatedAt: now,
    });
    return summary(project);
  }

  getProject(id) {
    const project = this.store.getProject(id);
    return project ? summary(project) : null;
  }

  getManifest(id) { return this.requireProject(id).manifest; }
  getKnowledgePack(id) { return this.requireProject(id).knowledgePack; }
  knowledgeSummary(id) { return knowledgeSummary(this.requireProject(id).knowledgePack); }

  overridesPath(projectId) {
    return path.join(this.ingestion.projectRoot(projectId), 'content-overrides.json');
  }

  designChoicesPath(projectId) {
    return path.join(this.ingestion.projectRoot(projectId), 'design-choices.json');
  }

  readDesignChoices(projectId) {
    this.requireProject(projectId);
    const file = this.designChoicesPath(projectId);
    if (!fs.existsSync(file)) return { schemaVersion: 1, projectId, choices: {} };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  bespokePresentationsPath(projectId) {
    return path.join(this.ingestion.projectRoot(projectId), 'bespoke-presentations.json');
  }

  /**
   * The bespoke presentations this project carries.
   *
   * Durable for the same reason a section-variant choice is: a rebuild
   * generates into a fresh workspace, so anything that lives only in the
   * previous one is lost the next time the project is built. A presentation
   * that survived one build and vanished from the next would be worse than
   * never having had one, because the review that passed it would still be on
   * the record.
   */
  readBespokePresentations(projectId) {
    this.requireProject(projectId);
    const file = this.bespokePresentationsPath(projectId);
    if (!fs.existsSync(file)) return { schemaVersion: 1, projectId, presentations: [] };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  /**
   * Write one bespoke presentation into a workspace, or say why it cannot be.
   *
   * Re-validated against *this* build rather than the one it was written for.
   * A rebuild whose design system stopped emitting a token the presentation
   * reads would otherwise leave the declaration resolving to nothing and the
   * section quietly losing its shape — the exact failure the token rule exists
   * to prevent, arriving through the back door of a rebuild.
   *
   * A refusal skips the file and is recorded. It does not fail the build: a
   * project is not bricked because one section's bespoke presentation no longer
   * resolves, and a refusal nobody can see is a refusal nobody can fix, so it
   * reaches the build record either way.
   */
  applyBespokePresentations(projectId, workspace) {
    const stored = this.readBespokePresentations(projectId).presentations;
    if (!stored.length) return { applied: [], refused: [] };
    const specPath = path.join(workspace, '.product/design-system.json');
    const compiledTokens = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath, 'utf8')).tokens ?? {} : {};
    const tokensCss = path.join(workspace, 'src/design/tokens.css');
    const defaults = fs.existsSync(tokensCss) ? templateTokenDefaults(fs.readFileSync(tokensCss, 'utf8')) : new Set();

    const applied = [];
    const refused = [];
    for (const presentation of stored) {
      const problems = validateBespokePresentation(presentation, { compiledTokens, templateTokenDefaults: defaults });
      if (problems.length) {
        refused.push({ presentationId: presentation.presentationId, sectionId: presentation.sectionId, problems });
        continue;
      }
      writeBespokePresentation(workspace, presentation, { compiledTokens, templateTokenDefaults: defaults });
      applied.push({ presentationId: presentation.presentationId, sectionId: presentation.sectionId, files: presentation.changeSet.files });
    }
    return { applied, refused };
  }

  /**
   * The build record a generated workspace carries.
   *
   * One reader, so every caller that needs a fact about how this build was
   * generated — its template, its renderer, what starting its dev server
   * requires — reads it from the build itself rather than re-deriving it from
   * the factory's current registries.
   */
  readProjectRecord(projectId) {
    const project = this.requireProject(projectId);
    const file = project.workspacePath ? path.join(project.workspacePath, '.app-builder', 'project.json') : null;
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  /** The design the live build compiled, with the controls offered over it. */
  designContract(projectId) {
    const project = this.requireProject(projectId);
    const file = project.workspacePath ? path.join(project.workspacePath, '.app-builder', 'project.json') : null;
    if (!file || !fs.existsSync(file)) return null;
    const design = JSON.parse(fs.readFileSync(file, 'utf8')).design ?? null;
    if (!design) return null;
    const chosen = this.readDesignChoices(projectId).choices;
    return { design, chosen, controls: designControls(design), accentContrastMinimum: 4.5 };
  }

  /**
   * Record a design decision and compile it.
   *
   * The brand stylesheet is a generated file, so rewriting it puts the change
   * in front of the person who made it without a rebuild. The durable record is
   * what a later build replays: a rebuild picks up new source material without
   * discarding how someone set the design.
   */
  async writeDesignChoices(projectId, choices) {
    const project = this.requireProject(projectId);
    const merged = { ...this.readDesignChoices(projectId).choices, ...assertDesignChoices(choices, { factoryRoot: this.factoryRoot }) };
    // A control set back to nothing returns to what the factory selected rather
    // than recording a value that happens to match it.
    for (const [key, value] of Object.entries(choices)) if (value === null) delete merged[key];

    const document = assertContract('design-choice', { schemaVersion: 1, projectId, choices: merged, chosenAt: new Date().toISOString(), chosenBy: 'console' });
    fs.mkdirSync(path.dirname(this.designChoicesPath(projectId)), { recursive: true });
    fs.writeFileSync(this.designChoicesPath(projectId), `${JSON.stringify(document, null, 2)}\n`);

    if (project.workspacePath && fs.existsSync(project.workspacePath)) this.rewriteWorkspaceDesign(project.workspacePath, document.choices);
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'design.contract.updated',
      actor: 'console',
      payload: { controls: Object.keys(document.choices), ...document.choices },
    }));
    return this.designContract(projectId);
  }

  rewriteWorkspaceDesign(workspace, choices) {
    const file = path.join(workspace, '.app-builder', 'project.json');
    if (!fs.existsSync(file)) return null;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Apply over what the factory selected, never over the last thing written,
    // so clearing a control returns it rather than leaving the previous value.
    const design = applyDesignChoices(record.composedDesign ?? record.design, choices, { factoryRoot: this.factoryRoot });
    fs.writeFileSync(file, `${JSON.stringify({ ...record, design, designSystemSpec: DESIGN_SYSTEM_SPEC_PATH }, null, 2)}\n`);
    // A live edit goes through the same writer generation uses, so the portable
    // spec a person walks away with is never the one the last build left behind.
    writeDesignArtifacts(workspace, design);
    return design;
  }

  /**
   * Lint a build from what it compiled and what it composed.
   *
   * Deliberately cheap and deliberately early: no browser, no model. Returns
   * null where a build has no compiled design yet, rather than inventing a
   * clean report for a project that has not been generated.
   */
  designLintReport(projectId, composition = null) {
    const project = this.requireProject(projectId);
    const workspace = project.workspacePath;
    if (!workspace) return null;
    const specFile = path.join(workspace, DESIGN_SYSTEM_SPEC_PATH);
    if (!fs.existsSync(specFile)) return null;
    const composed = composition ?? this.getComposition(projectId);
    if (!composed) return null;
    const template = this.workspaceTemplate(projectId);
    const tokenSource = template?.presentation?.tokenSource
      ? path.join(workspace, template.presentation.tokenSource)
      : null;
    return compileDesignLintReport({
      spec: JSON.parse(fs.readFileSync(specFile, 'utf8')),
      composition: composed,
      tokenSourceCss: tokenSource && fs.existsSync(tokenSource) ? fs.readFileSync(tokenSource, 'utf8') : '',
      compositionHash: composed.compositionHash ?? null,
    });
  }

  sectionVariantsPath(projectId) {
    return path.join(this.ingestion.projectRoot(projectId), 'section-variants.json');
  }

  readSectionVariants(projectId) {
    this.requireProject(projectId);
    const file = this.sectionVariantsPath(projectId);
    if (!fs.existsSync(file)) return { schemaVersion: 1, projectId, choices: [] };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  /**
   * The template a build was generated from.
   *
   * Read back from the build's own record rather than from the current
   * registry, so what a section may be shown as is decided by the template that
   * actually rendered it.
   */
  workspaceTemplate(projectId) {
    const project = this.requireProject(projectId);
    const file = project.workspacePath ? path.join(project.workspacePath, '.app-builder', 'project.json') : null;
    if (!file || !fs.existsSync(file)) return null;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entry = this.templateCatalog()?.templates?.[record.template?.id];
    if (!entry) return null;
    const descriptor = path.resolve(process.cwd(), entry.path, 'template.json');
    return fs.existsSync(descriptor) ? JSON.parse(fs.readFileSync(descriptor, 'utf8')) : null;
  }

  templateCatalog() {
    const file = path.resolve(process.cwd(), 'config/templates.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  async writeSectionVariants(projectId, choices, change = null) {
    const project = this.requireProject(projectId);
    const document = assertContract('section-variant', { schemaVersion: 1, projectId, choices });
    fs.mkdirSync(path.dirname(this.sectionVariantsPath(projectId)), { recursive: true });
    fs.writeFileSync(this.sectionVariantsPath(projectId), `${JSON.stringify(document, null, 2)}\n`);

    // A presentation choice is composition, so the running preview can show it
    // without a rebuild, exactly as an edited sentence does.
    if (project.workspacePath && fs.existsSync(project.workspacePath)) {
      this.rewriteWorkspaceComposition(project.workspacePath, this.readOverrides(projectId).overrides, document.choices);
    }
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'section.variant.chosen',
      actor: 'console',
      payload: { sectionId: change?.sectionId ?? null, variant: change?.variant ?? null, chosen: document.choices.length },
    }));
    return document.choices;
  }

  assetDecisionsPath(projectId) {
    return path.join(this.ingestion.projectRoot(projectId), 'asset-decisions.json');
  }

  readAssetDecisions(projectId) {
    this.requireProject(projectId);
    const file = this.assetDecisionsPath(projectId);
    if (!fs.existsSync(file)) return { schemaVersion: 1, projectId, decisions: [] };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  /**
   * Record what a person decided about individual assets.
   *
   * The decisions live beside the knowledge pack rather than inside it. The
   * pack is derived truth about sources and every asset in it must agree with
   * the source it came from; a human overriding one photograph is a different
   * kind of statement and does not get to rewrite that derivation. Composition
   * reads both.
   */
  // What the live build would have to be rebuilt to catch up with.
  assetDecisionsHash(projectId) {
    return assetDecisionsHash(this.readAssetDecisions(projectId).decisions);
  }

  async writeAssetDecisions(projectId, decisions, change = null) {
    this.requireProject(projectId);
    const document = assertContract('asset-decision', { schemaVersion: 1, projectId, decisions });
    fs.mkdirSync(path.dirname(this.assetDecisionsPath(projectId)), { recursive: true });
    fs.writeFileSync(this.assetDecisionsPath(projectId), `${JSON.stringify(document, null, 2)}\n`);
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'asset.governance.updated',
      actor: 'console',
      payload: {
        assetId: change?.assetId ?? null,
        decision: change?.decision ?? null,
        rightsDeclaration: change?.rightsDeclaration ?? null,
        cropReview: change?.cropReview ?? null,
        publishUseAllowed: change?.effect?.publishUseAllowed ?? false,
        decided: document.decisions.length,
      },
    }));
    return document.decisions;
  }

  readOverrides(projectId) {
    this.requireProject(projectId);
    const file = this.overridesPath(projectId);
    if (!fs.existsSync(file)) return { schemaVersion: 1, projectId, overrides: [] };
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  /**
   * Record a human edit and replay it into the live workspace.
   *
   * The composition on disk is what the running preview renders, so rewriting
   * it lets an edit appear immediately without a rebuild. The durable record is
   * the override file: a later rebuild replays it over freshly composed output.
   */
  async saveOverrides(projectId, overrides) {
    const project = this.requireProject(projectId);
    const document = assertContract('content-override', {
      schemaVersion: 1,
      projectId,
      overrides: overrides.map((entry) => ({ editedBy: 'console', ...entry })),
    });
    // Shape first, then identity. A malformed document is a caller mistake; an
    // unresolvable target is an edit with nowhere to land, and neither reaches
    // disk.
    this.assertOverridesResolve(projectId, document.overrides);
    fs.mkdirSync(path.dirname(this.overridesPath(projectId)), { recursive: true });
    fs.writeFileSync(this.overridesPath(projectId), `${JSON.stringify(document, null, 2)}\n`);

    let composition = null;
    if (project.workspacePath && fs.existsSync(project.workspacePath)) {
      composition = this.rewriteWorkspaceComposition(project.workspacePath, document.overrides);
    }
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'content.overrides.saved',
      actor: 'console',
      payload: { count: document.overrides.length, compositionHash: composition?.compositionHash ?? null },
    }));
    return { overrides: document.overrides, composition: composition ? { compositionHash: composition.compositionHash } : null };
  }

  rewriteWorkspaceComposition(workspace, overrides, variants = null) {
    const file = path.join(workspace, '.app-builder', 'composition.json');
    if (!fs.existsSync(file)) return null;
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Replay from the deterministic baseline so removing an edit or a
    // presentation choice restores what the factory composed rather than
    // leaving the previous one in place.
    const baseline = stripSectionVariants(stripContentOverrides(stored));
    const chosen = variants ?? stored.sections.filter((section) => section.variantOverriddenFrom).map((section) => ({ sectionId: section.id, variant: section.variant }));
    const next = assertContract('composition', applySectionVariants(applyContentOverrides(baseline, overrides), chosen));
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    fs.writeFileSync(path.join(workspace, 'src/generated/composition.ts'), `export const composition = ${JSON.stringify(next, null, 2)} as const;\n`);
    return next;
  }
  listProjects() { return this.store.listProjects().map(summary); }
  listTasks(projectId) { this.requireProject(projectId); return this.store.listTasks(projectId); }
  listEvents(projectId, options) { this.requireProject(projectId); return this.store.listEvents(projectId, options); }
  metrics(projectId) { this.requireProject(projectId); return this.store.metrics(projectId); }
  latestCheckpoint(projectId) { this.requireProject(projectId); return this.store.latestCheckpoint(projectId); }
  listCheckpoints(projectId) { this.requireProject(projectId); return this.store.listCheckpoints(projectId); }

  getComposition(projectId) {
    const project = this.requireProject(projectId);
    if (!project.workspacePath) return null;
    const file = path.join(project.workspacePath, '.app-builder', 'composition.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  /**
   * Read the Builder Element Identity index the live build recorded.
   *
   * Null means the build cannot be edited by direct manipulation at all — an
   * older workspace, or a template that declares no presentation contract —
   * which every caller must treat as a refusal rather than as permission.
   */
  elementIdentityIndex(projectId) {
    const project = this.requireProject(projectId);
    if (!project.workspacePath) return null;
    const file = path.join(project.workspacePath, '.app-builder', 'element-identity.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  /**
   * Resolve a rendered element to its full identity.
   *
   * The preview reports coordinates it can see — page, section, element key —
   * and the resolution happens here against the durable index rather than in
   * the browser, so the DOM never carries source ids, file paths or anything
   * else the deployed site has no business publishing.
   */
  resolveElement(projectId, target) {
    const index = this.elementIdentityIndex(projectId);
    const ref = typeof target === 'string'
      ? target
      : elementRef(String(target?.pageId ?? ''), String(target?.sectionId ?? ''), String(target?.elementKey ?? ''));
    if (!index) return { status: 'unknown', ref, identity: null, projectId };
    const composition = this.getComposition(projectId);
    const resolution = resolveElementIdentity(index, ref, { compositionHash: this.baselineCompositionHash(composition) });
    if (resolution.status !== 'resolved') return { ...resolution, projectId };
    return { ...resolution, identity: this.withLiveProvenance(composition, resolution.identity), projectId };
  }

  // The index describes what the factory built. Whether a person has since
  // rewritten a binding is live state, so it is read from the composition the
  // preview is actually rendering rather than baked into the address.
  withLiveProvenance(composition, identity) {
    if (!identity.bindingKey || !composition) return identity;
    const entry = composition.sections
      .find((section) => section.id === identity.sectionId)?.bindings
      .find((binding) => binding.key === identity.bindingKey);
    if (!entry) return identity;
    return {
      ...identity,
      provenance: {
        ...identity.provenance,
        origin: entry.origin,
        generated: Boolean(entry.generated),
        overridden: Boolean(entry.overriddenFrom),
        overriddenFromOrigin: entry.overriddenFrom?.origin ?? null,
      },
    };
  }

  // Identity is derived from the deterministic baseline, so staleness is
  // measured against the baseline too, and it has to strip everything the
  // derivation strips. Otherwise writing a sentence or choosing how a section
  // reads would make every address in the build look stale.
  baselineCompositionHash(composition) {
    return composition ? stripSectionVariants(stripContentOverrides(composition)).compositionHash : null;
  }

  /**
   * Refuse an edit whose target does not resolve.
   *
   * Only overrides that are new or changed are checked. Removing an edit, or
   * re-sending one a previous build accepted, must keep working: a rebuild that
   * drops a section should not be able to wedge the whole edit record.
   */
  assertOverridesResolve(projectId, overrides) {
    const existing = new Map(this.readOverrides(projectId).overrides.map((entry) => [`${entry.sectionId}/${entry.bindingKey}`, entry.value]));
    const changed = overrides.filter((entry) => existing.get(`${entry.sectionId}/${entry.bindingKey}`) !== entry.value);
    if (!changed.length) return;
    const index = this.elementIdentityIndex(projectId);
    if (!index) throw new Error('Unresolved element identity: this project has no generated build carrying an element identity index, so an edit cannot be attributed to a rendered element.');
    const composition = this.getComposition(projectId);
    for (const entry of changed) {
      // An override names a section and a binding; the page is whichever one
      // the build put that section on. Looking it up in the index rather than
      // assembling a ref means a section this build does not render reads as
      // unresolved instead of as a malformed address.
      const elementKey = bindingElementKey(entry.bindingKey);
      const match = index.elements.find((element) => element.sectionId === entry.sectionId && element.elementKey === elementKey);
      if (!match) throw new Error(`Unresolved element identity: ${entry.sectionId}/${elementKey} does not resolve to an element this build renders.`);
      assertEditableElement(index, match.ref, 'text', { compositionHash: this.baselineCompositionHash(composition) });
    }
  }

  evidenceDirectory(projectId, evidenceId = null) {
    // Both segments reach this code from an HTTP path, so each is resolved and
    // re-checked rather than trusted to stay inside the evidence root.
    const base = path.resolve(this.evidenceRoot);
    const project = path.resolve(base, projectId);
    if (project === base || !project.startsWith(`${base}${path.sep}`)) throw new Error(`Unsafe evidence directory: ${projectId}`);
    if (!evidenceId) return project;
    const target = path.resolve(project, evidenceId);
    if (target === project || !target.startsWith(`${project}${path.sep}`)) throw new Error(`Unsafe evidence directory: ${evidenceId}`);
    return target;
  }

  listRenderedEvidence(projectId) {
    this.requireProject(projectId);
    const directory = this.evidenceDirectory(projectId);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .map((entry) => path.join(directory, entry, 'evidence.json'))
      .filter((file) => fs.existsSync(file))
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  }

  getRenderedEvidence(projectId, evidenceId) {
    this.requireProject(projectId);
    const file = path.join(this.evidenceDirectory(projectId, evidenceId), 'evidence.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  /**
   * Read one capture's bytes.
   *
   * The filename is taken from the recorded evidence rather than from the
   * request, so a caller cannot name a path the evidence does not contain.
   */
  readRenderedCapture(projectId, evidenceId, captureId) {
    const evidence = this.getRenderedEvidence(projectId, evidenceId);
    const capture = evidence?.captures.find((entry) => entry.id === captureId);
    if (!capture) return null;
    const file = path.join(this.evidenceDirectory(projectId, evidenceId), capture.file);
    return fs.existsSync(file) ? { capture, bytes: fs.readFileSync(file) } : null;
  }

  /** What a browser would be pointed at for this build, without pointing one at it. */
  renderedEvidencePlan(projectId) {
    const composition = this.getComposition(projectId);
    if (!composition) return null;
    return deriveEvidencePlan({
      composition,
      stateMatrix: deriveStateMatrix(composition, this.launchReadinessRules()),
      elementIdentity: this.elementIdentityIndex(projectId),
    });
  }

  /**
   * Capture what this build actually renders.
   *
   * It runs against the service-managed preview, which is the same rendering a
   * person reviews, rather than against a separately started server that might
   * not be serving the same workspace.
   */
  async captureRenderedEvidence(projectId) {
    const { project, workspace } = this.requireWorkspace(projectId);
    const preview = this.previewTarget(projectId);
    if (!preview) throw new Error('Rendered evidence is captured from the running preview. Start the preview first.');
    const composition = this.getComposition(projectId);
    if (!composition) return null;

    let task = createTask({
      projectId,
      objective: `Capture rendered evidence for ${project.name}`,
      acceptanceCriteria: [
        'Every route is captured at desktop, tablet and mobile',
        'Critical interaction states the build actually has are captured',
        'States a capture cannot establish are recorded as uncovered with a reason',
        'Evidence references files that exist and hash to what was captured',
      ],
      policyId: 'verification',
      budget: { maxIterations: 1, maxRuntimeMs: 10 * 60 * 1000, maxCostGbp: 0, maxTokens: 0, maxNoProgressAttempts: 1 },
    });
    this.store.upsertTask(task);
    task = transitionTask(task, 'running', { incrementAttempt: true });
    this.store.upsertTask(task);

    const started = Date.now();
    const plan = deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition, this.launchReadinessRules()), elementIdentity: this.elementIdentityIndex(projectId) });
    await this.store.recordEvent(createEvent({
      projectId,
      taskId: task.id,
      type: 'evidence.capture.started',
      actor: 'factory-service',
      payload: { planned: plan.captures.length, uncovered: plan.uncovered.length, viewports: plan.viewports.map((viewport) => viewport.name) },
    }));

    try {
      const { results, failures } = await captureEvidence({ plan, baseUrl: preview.url });
      if (!results.length) throw new Error(`No rendered evidence could be captured: ${failures[0]?.message ?? 'the browser produced nothing'}`);

      const evidence = assertContract('rendered-evidence', buildEvidenceSet({
        plan,
        results,
        projectId,
        buildRef: workspace,
        compositionHash: composition.compositionHash,
        capturedAt: new Date().toISOString(),
        taskId: task.id,
        // The composition is what makes "these two routes must differ"
        // answerable, so it travels with the captures rather than being
        // re-derived from them.
        composition,
        // The rules travel with the pictures. A reviewer, or a later visual
        // critic, should not re-derive from a screenshot what a rule already
        // settled from the compiled design and the composition.
        designLint: this.designLintReport(projectId, composition),
      }));

      const directory = this.evidenceDirectory(projectId, evidence.id);
      fs.mkdirSync(path.join(directory, 'captures'), { recursive: true });
      for (const result of results) {
        if (!evidence.captures.some((capture) => capture.id === result.id)) continue;
        fs.writeFileSync(path.join(directory, captureFile(result.id)), result.bytes);
      }
      fs.writeFileSync(path.join(directory, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);

      const checkpoint = createCheckpoint({
        projectId,
        taskId: task.id,
        repoRef: workspace,
        summary: `Captured ${evidence.captures.length} rendered capture(s) across ${evidence.viewports.length} viewport(s); ${evidence.uncovered.length} state(s) recorded as uncovered.`,
        filesChanged: [],
        failures: failures.map((failure) => `${failure.id}: ${failure.message}`),
        artifacts: ['rendered-evidence'],
        nextAction: 'Review the captures, then rebuild or edit what they show.',
      });
      this.store.recordCheckpoint(checkpoint);
      task = transitionTask(task, 'succeeded', { latestCheckpointId: checkpoint.id });
      this.store.upsertTask(task);

      await this.store.recordEvent(createEvent({
        projectId,
        taskId: task.id,
        type: 'evidence.captured',
        actor: 'factory-service',
        payload: {
          evidenceId: evidence.id,
          setHash: evidence.setHash,
          captures: evidence.captures.length,
          uncovered: evidence.uncovered.length,
          failed: failures.length,
        },
        usage: { durationMs: Date.now() - started },
      }));
      return { project: summary(project), task, checkpoint, evidence, failures };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      task = transitionTask(task, 'failed', { stopReason: message });
      this.store.upsertTask(task);
      await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'evidence.capture.failed', actor: 'factory-service', payload: { message }, usage: { durationMs: Date.now() - started } }));
      throw error;
    }
  }

  /**
   * The bytes the Console shows when someone is choosing a focal point.
   *
   * Served from the retained original where there is one, falling back to the
   * widest responsive variant, so the picture being pointed at is the picture
   * the crop will come from.
   */
  readAssetPreview(projectId, assetId) {
    const pack = this.getKnowledgePack(projectId);
    const asset = (pack?.assets ?? []).find((entry) => entry.id === assetId);
    if (!asset) return null;
    const directory = this.ingestion.assetDirectory(projectId);
    if (!fs.existsSync(directory)) return null;

    const prefix = `${String(asset.contentHash ?? '').slice(0, 16)}-original.`;
    const original = fs.readdirSync(directory).find((entry) => entry.startsWith(prefix));
    if (original) return { file: path.join(directory, original), mimeType: asset.mimeType ?? 'application/octet-stream' };

    const widest = (asset.variants ?? [])
      .filter((variant) => variant.role === 'responsive' && variant.format === 'webp')
      .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
      .at(-1);
    if (!widest) return null;
    // Variant URIs come from the knowledge pack, which is data rather than
    // authority, so a traversing path must not resolve outside the directory.
    const base = path.resolve(directory);
    const target = path.resolve(base, String(widest.uri).replace(/^assets\//, ''));
    if (!target.startsWith(`${base}${path.sep}`) || !fs.existsSync(target)) return null;
    return { file: target, mimeType: 'image/webp' };
  }

  launchReadinessRules() {
    const file = path.resolve(process.cwd(), 'config/launch-readiness-rules.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  /**
   * What the live build needs, and what is worth proving about it.
   *
   * The state matrix and journey ledger are Phase 3.8K's derivations, read
   * here rather than derived again. Rendered evidence raises the states a
   * capture settles; everything else keeps waiting for evidence a picture
   * cannot give.
   */
  productReview(projectId) {
    const composition = this.getComposition(projectId);
    const rules = this.launchReadinessRules();
    if (!composition || !rules) return null;

    const audit = auditLaunchReadiness({ composition, rules, manifest: this.getManifest(projectId) });
    const evidence = this.listRenderedEvidence(projectId).at(-1) ?? null;
    const stateMatrix = evidence ? applyEvidenceToStateMatrix(audit.stateMatrix, evidence) : audit.stateMatrix;

    return {
      launchable: audit.launchable,
      predictedManualEdits: audit.predictedManualEdits,
      summary: audit.summary,
      ...deriveOpportunities({ audit, rules }),
      stateMatrix,
      journeys: audit.journeys,
      evidenceId: evidence?.id ?? null,
    };
  }

  integrationStatus() {
    const entries = [
      ['netlify', 'NETLIFY_AUTH_TOKEN'],
      ['supabase', 'SUPABASE_ACCESS_TOKEN'],
      ['openai', 'OPENAI_API_KEY'],
      ['anthropic', 'ANTHROPIC_API_KEY'],
    ];
    return entries.map(([id, variable]) => ({ id, configured: Boolean(this.env[variable]) }));
  }

  requireProject(id) {
    const project = this.store.getProject(id);
    if (!project) throw new Error(`Unknown project: ${id}`);
    return project;
  }

  requireWorkspace(id) {
    const project = this.requireProject(id);
    if (!project.workspacePath || !fs.existsSync(project.workspacePath)) throw new Error('Project has no generated workspace yet.');
    return { project, workspace: project.workspacePath };
  }

  /**
   * `taskId` and `actor` are options rather than fixed, because an attempt
   * lifecycle event belongs to the task it ran for and names the runtime that
   * produced it. Both default to the previous behaviour, so existing callers
   * are unchanged.
   */
  async recordOperationalEvent(projectId, type, payload = {}, usage = {}, { taskId = null, actor = 'factory-service' } = {}) {
    this.requireProject(projectId);
    return this.store.recordEvent(createEvent({ projectId, taskId, type, actor, payload, usage }));
  }

  /**
   * Normalise real source material into the project's trusted knowledge pack.
   * Ingestion is additive and only accepted before a workspace exists, because
   * composition reads the knowledge pack at generation time and there is no
   * recompose path yet.
   */
  async ingestSources(projectId, requests) {
    let project = this.requireProject(projectId);
    if (project.state === 'generating') throw new Error('Project generation is already running.');

    let task = createTask({
      projectId,
      objective: `Ingest ${requests.length} source(s) for ${project.name}`,
      acceptanceCriteria: [
        'Every source is deterministically normalised',
        'Source governance and provenance are preserved',
        'Imported content carries no instruction authority',
        'The knowledge pack is structurally and relationally valid',
      ],
      policyId: 'implementation',
      budget: { maxIterations: 1, maxRuntimeMs: 10 * 60 * 1000, maxCostGbp: 0, maxTokens: 0, maxNoProgressAttempts: 1 },
    });
    this.store.upsertTask(task);
    task = transitionTask(task, 'running', { incrementAttempt: true });
    this.store.upsertTask(task);

    const started = Date.now();
    await this.store.recordEvent(createEvent({
      projectId,
      taskId: task.id,
      type: 'sources.ingestion.started',
      actor: 'factory-service',
      payload: { requested: requests.length, kinds: requests.map((request) => request.type) },
    }));

    try {
      const { pack, added, sourceCount } = await this.ingestion.ingest(projectId, requests);
      const now = new Date().toISOString();
      project = this.store.upsertProject({ ...project, knowledgePack: pack, updatedAt: now });
      // Ingestion regenerates derived files from the source, which would hand an
      // attention heuristic back any framing a person already chose.
      await reapplyAssetFocalPoints(this, projectId);

      const checkpoint = createCheckpoint({
        projectId,
        taskId: task.id,
        repoRef: projectId,
        summary: `Ingested ${added.length} source(s); ${sourceCount} in total across ${pack.facts.length} fact(s) and ${pack.assets.length} asset(s).`,
        filesChanged: [],
        failures: [],
        artifacts: ['knowledge-pack'],
        nextAction: project.workspacePath ? 'Review source governance, then rebuild the project so the new material reaches the generated repository.' : 'Review source governance, then generate the project.',
      });
      this.store.recordCheckpoint(checkpoint);
      task = transitionTask(task, 'succeeded', { latestCheckpointId: checkpoint.id });
      this.store.upsertTask(task);

      await this.store.recordEvent(createEvent({
        projectId,
        taskId: task.id,
        type: 'sources.ingested',
        actor: 'factory-service',
        payload: {
          packHash: pack.packHash,
          added: added.map((source) => ({ id: source.id, kind: source.kind, uri: source.uri, rightsStatus: source.rightsStatus, assetStatus: source.assetStatus })),
          sourceCount,
          factCount: pack.facts.length,
          assetCount: pack.assets.length,
          chunkCount: pack.chunks.length,
        },
        usage: { durationMs: Date.now() - started },
      }));
      return { project: summary(project), task, checkpoint, knowledge: knowledgeSummary(pack), added };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      task = transitionTask(task, 'failed', { stopReason: message });
      this.store.upsertTask(task);
      await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'sources.ingestion.failed', actor: 'factory-service', payload: { message }, usage: { durationMs: Date.now() - started } }));
      throw error;
    }
  }

  /**
   * Ingest a replacement without announcing it as new material.
   *
   * Replacing a picture is not the same event as supplying more of it: the
   * ledger should say a photograph was replaced, once, rather than claiming
   * sources arrived and then that one was withdrawn.
   */
  async ingestSourcesForReplacement(projectId, requests) {
    const project = this.requireProject(projectId);
    if (project.state === 'generating') throw new Error('Project generation is already running.');
    const { pack, added } = await this.ingestion.ingest(projectId, requests);
    this.store.upsertProject({ ...project, knowledgePack: pack, updatedAt: new Date().toISOString() });
    await reapplyAssetFocalPoints(this, projectId);
    return { pack, added };
  }

  async generateProject(projectId) {
    let project = this.requireProject(projectId);
    if (project.state === 'generating') throw new Error('Project generation is already running.');
    const { workspace, version } = nextWorkspace(this.workspacesRoot, project.slug);
    // A running preview serves the previous build's workspace, so it must not
    // survive into a rebuild and quietly show stale output.
    if (version > 1) await this.stopPreview(projectId);

    let task = createTask({
      projectId,
      objective: version === 1 ? `Generate standalone project ${project.name}` : `Rebuild ${project.name} as build v${version}`,
      acceptanceCriteria: [
        'Manifest is valid and buildable',
        'Composition is materialised with provenance',
        'Generated repository is standalone',
        'Recipe installation inventory is complete',
      ],
      policyId: 'implementation',
      budget: { maxIterations: 1, maxRuntimeMs: 15 * 60 * 1000, maxCostGbp: 0, maxTokens: 0, maxNoProgressAttempts: 1 },
    });
    this.store.upsertTask(task);
    task = transitionTask(task, 'running', { incrementAttempt: true });
    this.store.upsertTask(task);

    project = this.store.upsertProject({ ...project, state: 'generating', updatedAt: new Date().toISOString() });
    const started = Date.now();
    await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'build.started', actor: 'factory-service', payload: { buildVersion: version, manifestVersion: project.manifest.schemaVersion ?? 1, knowledgePackHash: project.knowledgePack?.packHash ?? null } }));

    try {
      const { plan, composition } = generateComposedProject(project.manifest, workspace, {
        knowledgePack: project.knowledgePack,
        assetSourceDir: this.ingestion.assetDirectory(projectId),
        contentOverrides: this.readOverrides(projectId).overrides,
        assetDecisions: this.readAssetDecisions(projectId).decisions,
        sectionVariants: this.readSectionVariants(projectId).choices,
        designChoices: this.readDesignChoices(projectId).choices,
        // The approved design references, as one bounded influence over the
        // art-direction plan. A project with none passes null and builds exactly
        // as it did before references existed.
        referenceInfluence: this.designReferenceInfluence(projectId),
        projectId,
        factoryRoot: this.factoryRoot,
      });
      // Any bespoke presentation this project carries, re-applied into the new
      // workspace. After generation, because it is the build's own compiled
      // tokens that decide whether the declaration still resolves.
      const bespoke = this.applyBespokePresentations(projectId, workspace);
      for (const refusal of bespoke.refused) {
        await this.store.recordEvent(createEvent({
          projectId,
          taskId: task.id,
          type: 'bespoke-presentation.refused',
          actor: 'factory-service',
          payload: { presentationId: refusal.presentationId, sectionId: refusal.sectionId, problems: refusal.problems },
        }));
      }

      await this.store.recordEvent(createEvent({
        projectId,
        taskId: task.id,
        type: 'composition.materialised',
        actor: 'factory-service',
        payload: { compositionHash: composition.compositionHash, pages: composition.pages.length, sections: composition.sections.length, warnings: composition.warnings },
      }));

      const inventory = recordRecipeInstallations(workspace);
      if (inventory.unresolved.length) throw new Error(`Recipe installation inventory unresolved: ${inventory.unresolved.map((item) => item.recipeId).join(', ')}`);
      await this.store.recordEvent(createEvent({
        projectId,
        taskId: task.id,
        type: 'repository.generated',
        actor: 'factory-service',
        payload: { workspace, buildVersion: version, templateId: plan.template.id, recipes: plan.recipes.map((recipe) => recipe.id), adapters: plan.adapters.map((adapter) => adapter.id) },
        usage: { durationMs: Date.now() - started },
      }));

      const checkpoint = createCheckpoint({
        projectId,
        taskId: task.id,
        repoRef: workspace,
        summary: `Build v${version}: generated ${project.name} from Manifest v${project.manifest.schemaVersion ?? 1}${project.knowledgePack ? ' and trusted knowledge pack' : ''}.`,
        filesChanged: [],
        failures: [],
        artifacts: ['.app-builder/manifest.json', '.app-builder/composition.json', '.app-builder/recipe-installations.json', DESIGN_SYSTEM_SPEC_PATH],
        nextAction: 'Run generated project verification and start a preview.',
      });
      this.store.recordCheckpoint(checkpoint);
      task = transitionTask(task, 'succeeded', { latestCheckpointId: checkpoint.id });
      this.store.upsertTask(task);
      project = this.store.upsertProject({ ...project, state: 'generated', workspacePath: workspace, updatedAt: new Date().toISOString() });
      await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'build.succeeded', actor: 'factory-service', payload: { checkpointId: checkpoint.id, workspace }, usage: { durationMs: Date.now() - started } }));
      return { project: summary(project), task, checkpoint, composition, workspace };
    } catch (error) {
      if (task.state === 'running') {
        task = transitionTask(task, 'failed', { stopReason: error instanceof Error ? error.message : String(error) });
        this.store.upsertTask(task);
      }
      project = this.store.upsertProject({ ...project, state: 'failed', updatedAt: new Date().toISOString() });
      await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'build.failed', actor: 'factory-service', payload: { message: error instanceof Error ? error.message : String(error) }, usage: { durationMs: Date.now() - started } }));
      throw error;
    }
  }

  async verifyProject(projectId) {
    let { project, workspace } = this.requireWorkspace(projectId);
    let task = createTask({
      projectId,
      objective: `Verify generated project ${project.name}`,
      acceptanceCriteria: ['Dependencies install independently', 'Generated project checks pass', 'Production build succeeds'],
      policyId: 'verification',
      budget: { maxIterations: 1, maxRuntimeMs: 15 * 60 * 1000, maxCostGbp: 0, maxTokens: 0, maxNoProgressAttempts: 1 },
    });
    this.store.upsertTask(task);
    task = transitionTask(task, 'running', { incrementAttempt: true });
    this.store.upsertTask(task);
    const started = Date.now();
    await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'quality.started', actor: 'factory-service', payload: { workspace } }));

    try {
      for (const step of [
        { type: 'quality.install.succeeded', command: 'npm', args: ['install', '--no-audit', '--no-fund'] },
        { type: 'quality.check.succeeded', command: 'npm', args: ['run', 'check'] },
        { type: 'quality.build.succeeded', command: 'npm', args: ['run', 'build'] },
      ]) {
        const usage = runCommand(step.command, step.args, workspace);
        await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: step.type, actor: 'factory-service', payload: { workspace }, usage }));
      }
      const checkpoint = createCheckpoint({
        projectId,
        taskId: task.id,
        repoRef: workspace,
        summary: `Verified independent install, checks and production build for ${project.name}.`,
        filesChanged: [],
        failures: [],
        artifacts: ['dist'],
        nextAction: 'Start a service-managed preview for product review.',
      });
      this.store.recordCheckpoint(checkpoint);
      task = transitionTask(task, 'succeeded', { latestCheckpointId: checkpoint.id });
      this.store.upsertTask(task);
      project = this.store.upsertProject({ ...project, state: 'verified', updatedAt: new Date().toISOString() });
      await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'quality.succeeded', actor: 'factory-service', payload: { checkpointId: checkpoint.id }, usage: { durationMs: Date.now() - started } }));
      return { project: summary(project), task, checkpoint };
    } catch (error) {
      task = transitionTask(task, 'failed', { stopReason: error instanceof Error ? error.message : String(error) });
      this.store.upsertTask(task);
      await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'quality.failed', actor: 'factory-service', payload: { message: error instanceof Error ? error.message : String(error) }, usage: { durationMs: Date.now() - started } }));
      throw error;
    }
  }

  // Visual candidates — Phase 4D -------------------------------------------

  visualCandidateSetPath(projectId) {
    return path.join(this.ingestion.projectRoot(projectId), 'visual-candidates.json');
  }

  readVisualCandidateSet(projectId) {
    this.requireProject(projectId);
    const file = this.visualCandidateSetPath(projectId);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  writeVisualCandidateSet(projectId, set) {
    const document = assertContract('visual-candidate-set', set);
    const file = this.visualCandidateSetPath(projectId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    return document;
  }

  /**
   * What every candidate in a set has to share.
   *
   * Composed once, here, from the manifest and knowledge pack as they stand.
   * A candidate is a presentation of this; nothing downstream may recompose it,
   * because candidates are comparable only while they say the same thing.
   */
  frozenProductTruth(projectId) {
    const project = this.requireProject(projectId);
    const composition = composeProject({
      manifest: project.manifest,
      knowledgePack: project.knowledgePack,
      assetDecisions: this.readAssetDecisions(projectId).decisions,
    });
    return {
      composition,
      frozenTruth: {
        projectType: project.manifest.project.type,
        manifestVersion: project.manifest.schemaVersion ?? 1,
        // A null pack hash is a fact, not a gap: a project replayed from an
        // approved intake bundle has an approved manifest and no ingested
        // material. It used to be indistinguishable from a hash that went
        // missing, so the manifest's own identity is recorded beside it and a
        // reviewer always has something to compare candidates against.
        manifestHash: hashOf(project.manifest),
        knowledgePackHash: project.knowledgePack?.packHash ?? null,
        knowledgeSource: project.knowledgePack ? 'ingested-knowledge-pack' : 'approved-manifest-only',
        baselineCompositionHash: composition.compositionHash,
      },
    };
  }

  /**
   * Generate two to four genuinely different presentations of one product truth.
   *
   * Each becomes a real repository — generated, installed and built — because a
   * screenshot of something never built is evidence of nothing. The diversity
   * check runs on the compiled signatures before any of that happens, so a set
   * that is one build in several colours costs a compile rather than three
   * installs and a browser run.
   */
  // `createdBy` has no default: the runtime that drives a generation is the one
  // barred from later promoting it, so it has to say who it is.
  async generateVisualCandidates(projectId, { directions = null, createdBy, now = new Date().toISOString() } = {}) {
    const project = this.requireProject(projectId);
    const existing = this.readVisualCandidateSet(projectId);
    if (existing && !existing.promotedCandidateId) {
      throw new Error(`Project ${projectId} already has an undecided candidate set (${existing.setId}). Promote or abandon it before generating another.`);
    }
    const { composition, frozenTruth } = this.frozenProductTruth(projectId);
    const assetDecisions = this.readAssetDecisions(projectId).decisions;
    const assetReadiness = compileAssetReadiness({ knowledgePack: project.knowledgePack, assetDecisions });
    const registry = loadVisualDirections(this.factoryRoot);
    const referenceInfluence = this.designReferenceInfluence(projectId);
    // The layout family is a property of the project type rather than of the
    // direction, and it belongs in the signature so a candidate set generated
    // across different shells is still comparable.
    const layoutPatternId = JSON.parse(fs.readFileSync(path.join(this.factoryRoot, 'config/layout-patterns.json'), 'utf8')).projectTypeDefaults?.[frozenTruth.projectType] ?? null;
    const { eligible, refused } = selectVisualDirections({
      projectType: frozenTruth.projectType,
      registry,
      assetReadiness,
      // The frozen composition, so a direction whose distinctive moment has
      // nothing to render here is refused rather than generated as a decision
      // that shows nothing.
      composition,
      requested: directions,
      // Approved design references reach direction selection here, and only
      // here. A refusal removes a direction with a recorded reason; a
      // preference tunes the plan the direction compiles.
      referenceInfluence,
    });
    if (eligible.length < 2) {
      // Where an approved design reference is part of why, say so. "Only one
      // direction is available" is a shortage the operator cannot act on; "the
      // reference you approved refuses the other two" is a decision they can
      // change in the panel they made it in.
      const byReference = refused.filter((entry) => entry.reason === 'reference-avoids-trait');
      const because = refused.map((entry) => `${entry.directionId} (${entry.reason})`).join(', ') || 'the registry offers no others';
      const advice = byReference.length
        ? ` A design reference this project approved refuses ${byReference.map((entry) => entry.directionId).join(' and ')}; narrow what that reference is used for, or disable it, to get a choice back.`
        : '';
      throw new Error(`Only ${eligible.length} visual direction is available for a ${frozenTruth.projectType}: ${because}. One candidate is not a choice.${advice}`);
    }

    const setId = buildCandidateSet({
      projectId,
      createdAt: now,
      frozenTruth,
      assetReadiness,
      refusedDirections: refused,
      createdBy,
      candidates: eligible.map((direction) => this.draftCandidate(direction, composition, layoutPatternId)),
    });

    const root = candidateRoot(this.workspacesRoot, project.slug, setId.setId);
    fs.mkdirSync(root, { recursive: true });
    const candidates = setId.candidates.map((candidate) => {
      const workspace = path.join(root, candidate.directionId);
      const build = generateComposedProject(project.manifest, workspace, {
        knowledgePack: project.knowledgePack,
        assetSourceDir: this.ingestion.assetDirectory(projectId),
        contentOverrides: this.readOverrides(projectId).overrides,
        assetDecisions,
        sectionVariants: this.readSectionVariants(projectId).choices,
        // The direction is the only thing that differs between candidates. Every
        // other input is the project's own.
        designChoices: { ...this.readDesignChoices(projectId).choices, visualDirection: candidate.directionId },
        referenceInfluence,
        projectId,
        factoryRoot: this.factoryRoot,
      });
      const spec = JSON.parse(fs.readFileSync(path.join(workspace, DESIGN_SYSTEM_SPEC_PATH), 'utf8'));
      return {
        ...candidate,
        workspace,
        compositionHash: build.composition.compositionHash,
        designSystemSpecHash: hashOf(spec),
      };
    });

    const set = this.writeVisualCandidateSet(projectId, { ...setId, candidates });
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'visual.candidates.generated',
      actor: createdBy,
      payload: {
        setId: set.setId,
        candidates: set.candidates.map((candidate) => candidate.directionId),
        refused: refused.map((entry) => `${entry.directionId}:${entry.reason}`),
        assetStrategy: assetReadiness.strategy,
        baselineCompositionHash: frozenTruth.baselineCompositionHash,
        referenceIds: referenceInfluence?.referenceIds ?? [],
      },
    }));
    return set;
  }

  /**
   * The approved design references, resolved into one bounded influence.
   *
   * Read at generation rather than stored on the project, so disabling or
   * removing a reference returns the next build to the factory's own decision
   * with nothing left behind to clean up.
   */
  designReferenceInfluence(projectId) {
    const influence = designReferenceInfluence(this, projectId);
    // Null rather than an empty influence: a project with no approved reference
    // must compile the plan it compiled before this existed, not a plan
    // carrying two empty arrays that say a reference did nothing.
    return influence.influenced ? influence : null;
  }

  /** One candidate, before it has been built or photographed. */
  draftCandidate(direction, baseline, patternId) {
    const composition = applyVisualDirection(baseline, direction);
    return {
      candidateId: `candidate-${direction.id}`,
      directionId: direction.id,
      directionLabel: direction.label,
      state: 'draft',
      artDirection: direction.artDirection,
      signature: structuralSignature({ direction, composition, design: { density: direction.design.density, patternId } }),
      compositionHash: composition.compositionHash,
      // Which approved references informed this candidate. An empty list is the
      // honest answer for a project that supplied none, rather than an omitted
      // field a reader has to interpret.
      referenceAnalysisIds: [...(direction.artDirection?.referenceIds ?? [])],
    };
  }

  /**
   * Install, verify, build and photograph every candidate in the set.
   *
   * Like for like, deliberately: the same routes, the same three viewports, the
   * same interaction states and the same DesignLint pass over every candidate.
   * A comparison between a candidate photographed at three widths and one
   * photographed at one is not a comparison.
   */
  async captureVisualCandidateEvidence(projectId, { capturedAt = new Date().toISOString() } = {}) {
    const set = this.readVisualCandidateSet(projectId);
    if (!set) throw new Error(`Project ${projectId} has no visual candidate set.`);
    if (set.promotedCandidateId) throw new Error(`This set already promoted ${set.promotedCandidateId}.`);

    // Only what has not been photographed yet. A bounded rework adds a revision
    // to a set whose siblings already have their evidence, and re-capturing
    // those would both cost a browser run and move a candidate through a state
    // transition it has already made.
    const pending = set.candidates.filter((candidate) => candidate.state === 'draft' && candidate.workspace);
    if (!pending.length) throw new Error(`Every candidate in set ${set.setId} has already been photographed.`);
    installSharedDependencies(pending.map((candidate) => candidate.workspace));
    const captured = [];
    for (const candidate of pending) {
      const dist = verifyCandidate(candidate.workspace);
      const server = await serveCandidateBuild(dist);
      try {
        const composition = JSON.parse(fs.readFileSync(path.join(candidate.workspace, '.app-builder/composition.json'), 'utf8'));
        const designLint = this.lintWorkspace(candidate.workspace, composition);
        const plan = deriveEvidencePlan({
          composition,
          stateMatrix: deriveStateMatrix(composition, this.launchReadinessRules()),
          elementIdentity: this.readWorkspaceElementIdentity(candidate.workspace),
        });
        const { results, failures } = await captureEvidence({ plan, baseUrl: server.url });
        if (!results.length) throw new Error(`No evidence could be captured for ${candidate.candidateId}: ${failures[0]?.message ?? 'the browser produced nothing'}`);
        const evidence = assertContract('rendered-evidence', buildEvidenceSet({
          plan,
          results,
          projectId,
          buildRef: candidate.workspace,
          compositionHash: composition.compositionHash,
          capturedAt,
          designLint,
        }));
        const directory = this.evidenceDirectory(projectId, evidence.id);
        fs.mkdirSync(path.join(directory, 'captures'), { recursive: true });
        for (const result of results) {
          if (!evidence.captures.some((entry) => entry.id === result.id)) continue;
          fs.writeFileSync(path.join(directory, captureFile(result.id)), result.bytes);
        }
        fs.writeFileSync(path.join(directory, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
        captured.push(recordCandidateEvidence(candidate, { evidenceId: evidence.id, designLint }));
      } finally {
        await server.close();
      }
    }

    const byId = new Map(captured.map((candidate) => [candidate.candidateId, candidate]));
    const updated = this.writeVisualCandidateSet(projectId, {
      ...set,
      candidates: set.candidates.map((candidate) => byId.get(candidate.candidateId) ?? candidate),
    });
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'visual.candidates.captured',
      actor: 'factory-service',
      payload: {
        setId: updated.setId,
        blocked: updated.candidates.filter((candidate) => candidate.gate.status === 'blocked').map((candidate) => candidate.candidateId),
        reviewRequired: updated.candidates.filter((candidate) => candidate.gate.status === 'review-required').map((candidate) => candidate.candidateId),
      },
    }));
    return updated;
  }

  /** Lint a workspace from its own compiled spec, composition and token source. */
  lintWorkspace(workspace, composition) {
    const specFile = path.join(workspace, DESIGN_SYSTEM_SPEC_PATH);
    if (!fs.existsSync(specFile)) return null;
    const tokenSource = path.join(workspace, 'src/design/tokens.css');
    return compileDesignLintReport({
      spec: JSON.parse(fs.readFileSync(specFile, 'utf8')),
      composition,
      tokenSourceCss: fs.existsSync(tokenSource) ? fs.readFileSync(tokenSource, 'utf8') : '',
      compositionHash: composition.compositionHash ?? null,
    });
  }

  readWorkspaceElementIdentity(workspace) {
    const file = path.join(workspace, '.app-builder/element-identity.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }

  /**
   * What an independent visual critic is given, and what it is not asked.
   *
   * The deterministic findings travel separately from the questions. A critic
   * handed "review this page" re-derives what a rule already settled; a critic
   * handed the settled list, the warnings it must speak to, and a scoped set of
   * genuinely subjective criteria spends its budget on the questions that need
   * it.
   */
  visualReviewPacket(projectId, candidateId) {
    const project = this.requireProject(projectId);
    const set = this.readVisualCandidateSet(projectId);
    const candidate = (set?.candidates ?? []).find((entry) => entry.candidateId === candidateId);
    if (!candidate) return null;
    const publishesImagery = Object.keys(this.readAssetDecisions(projectId).decisions).length > 0
      || (project.knowledgePack?.assets ?? []).some((asset) => asset.publishUseAllowed);
    return {
      setId: set.setId,
      candidateId,
      directionId: candidate.directionId,
      directionLabel: candidate.directionLabel,
      purpose: loadVisualDirections(this.factoryRoot).directions?.[candidate.directionId]?.purpose ?? null,
      projectType: set.frozenTruth.projectType,
      brand: this.designContract(projectId)?.design?.brand ?? null,
      artDirection: candidate.artDirection,
      assetStrategy: candidate.assetStrategy,
      evidenceId: candidate.evidenceId,
      // Already decided. Not a question.
      settledByRules: candidate.designLint?.findings ?? [],
      mustAddress: candidate.gate.mustAddress,
      gateStatus: candidate.gate.status,
      // The questions, and the bar the answers are held to. A reviewer that is
      // not told the bar cannot be expected to score against it, and a scored
      // review that never sees the threshold is a number with no meaning.
      criteria: reviewCriteriaFor({ projectType: set.frozenTruth.projectType, publishesImagery }),
      qualityGate: this.visualQualityGate(),
      iteration: candidate.iteration ?? 0,
      lineage: candidate.lineage ?? null,
      siblings: set.candidates.filter((entry) => entry.candidateId !== candidateId).map((entry) => ({ candidateId: entry.candidateId, directionLabel: entry.directionLabel, evidenceId: entry.evidenceId })),
    };
  }

  /** The declared professional bar, read from the pipeline gate registry. */
  visualQualityGate() {
    return loadVisualQualityGate(this.factoryRoot);
  }

  /** What the set currently allows: promote one, rework, or reject them all. */
  visualCandidateSetSummary(projectId) {
    const set = this.readVisualCandidateSet(projectId);
    if (!set) return null;
    const gate = this.visualQualityGate();
    return { ...summariseCandidateSet(set, gate), ...remainingReworkBudget(set, gate) };
  }

  async recordVisualCandidateReview(projectId, candidateId, review) {
    const set = this.readVisualCandidateSet(projectId);
    if (!set) throw new Error(`Project ${projectId} has no visual candidate set.`);
    const candidate = set.candidates.find((entry) => entry.candidateId === candidateId);
    if (!candidate) throw new Error(`No visual candidate ${candidateId} in set ${set.setId}.`);
    const packet = this.visualReviewPacket(projectId, candidateId);
    const reviewed = recordReview(
      candidate,
      { decidedAt: new Date().toISOString(), ...review },
      // The scoped criteria and the declared bar travel with the verdict, so a
      // review that skips a criterion or calls a below-bar candidate a pass is
      // refused here rather than discovered at promotion.
      { qualityGate: this.visualQualityGate(), criteria: packet?.criteria ?? null },
    );
    const updated = this.writeVisualCandidateSet(projectId, {
      ...set,
      candidates: set.candidates.map((entry) => (entry.candidateId === candidateId ? reviewed : entry)),
    });
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'visual.candidate.reviewed',
      actor: review.reviewedBy,
      payload: {
        setId: set.setId,
        candidateId,
        verdict: review.verdict,
        addressedRules: review.addressedRules ?? [],
        overallScore: reviewed.review.overallScore,
        thresholdMet: reviewed.review.thresholdMet,
        failingCriteria: reviewed.review.failingCriteria,
      },
    }));
    return updated;
  }

  /**
   * Decide the set without promoting anything.
   *
   * This is the button that was missing. A reviewer who has looked at every
   * candidate and concluded that all of them are competent and none of them is
   * good enough can now record exactly that, and the set closes or goes back for
   * one bounded pass rather than quietly promoting the least bad one.
   */
  async decideVisualCandidateSet(projectId, { outcome, decidedBy, rationale = null } = {}) {
    const set = this.readVisualCandidateSet(projectId);
    if (!set) throw new Error(`Project ${projectId} has no visual candidate set.`);
    const decided = decideCandidateSet(set, { outcome, decidedBy, rationale, decidedAt: new Date().toISOString() });
    const stored = this.writeVisualCandidateSet(projectId, decided);
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'visual.candidates.decided',
      actor: decidedBy,
      payload: {
        setId: set.setId,
        outcome,
        rationale,
        scores: stored.candidates.map((candidate) => ({ candidateId: candidate.candidateId, overallScore: candidate.review?.overallScore ?? null })),
      },
    }));
    return stored;
  }

  /**
   * One bounded rework pass over one candidate.
   *
   * The plan is derived from the verdict rather than written by whoever runs
   * this, and the revision is built from the same frozen truth through the same
   * generator. What changes is the axis values the plan names; what cannot
   * change is anything the composition says, and `attachRevisedCandidate`
   * refuses a revision whose composition hash moved.
   */
  async reworkVisualCandidate(projectId, candidateId, { plannedBy = 'design-critic' } = {}) {
    const project = this.requireProject(projectId);
    const set = this.readVisualCandidateSet(projectId);
    if (!set) throw new Error(`Project ${projectId} has no visual candidate set.`);
    const candidate = set.candidates.find((entry) => entry.candidateId === candidateId);
    if (!candidate) throw new Error(`No visual candidate ${candidateId} in set ${set.setId}.`);
    const gate = this.visualQualityGate();
    const packet = this.visualReviewPacket(projectId, candidateId);
    const plan = assertContract('visual-rework-plan', planVisualRework({
      set,
      candidate,
      gate,
      criteria: packet?.criteria ?? null,
      plannedBy,
      createdAt: new Date().toISOString(),
    }));

    if (!plan.targets.length) {
      // Nothing this lane can change. The plan is still recorded — it is the
      // durable statement of who owns what failed — but no revision is built,
      // because building one would spend an iteration proving nothing moved.
      const stored = this.writeVisualCandidateSet(projectId, { ...set, reworkPlans: [...(set.reworkPlans ?? []), plan] });
      await this.store.recordEvent(createEvent({
        projectId,
        type: 'visual.candidate.rework.planned',
        actor: plannedBy,
        payload: { setId: set.setId, planId: plan.planId, candidateId, revised: false, returnedTo: plan.returnedTo.map((entry) => `${entry.criterion}:${entry.role}`), customPresentation: Boolean(plan.customPresentation) },
      }));
      return { set: stored, plan, revisedCandidateId: null };
    }

    const { composition, frozenTruth } = this.frozenProductTruth(projectId);
    const registry = loadVisualDirections(this.factoryRoot);
    const referenceInfluence = this.designReferenceInfluence(projectId);
    const overrides = reworkOverrides(plan);
    const direction = compileVisualDirection(candidate.directionId, registry, { referenceInfluence, overrides });
    const layoutPatternId = JSON.parse(fs.readFileSync(path.join(this.factoryRoot, 'config/layout-patterns.json'), 'utf8')).projectTypeDefaults?.[frozenTruth.projectType] ?? null;
    const draft = this.draftCandidate(direction, composition, layoutPatternId);
    const revisedId = `${candidate.candidateId}-r${plan.iteration}`;

    const workspace = path.join(candidateRoot(this.workspacesRoot, project.slug, set.setId), `${direction.id}-r${plan.iteration}`);
    const assetDecisions = this.readAssetDecisions(projectId).decisions;
    const build = generateComposedProject(project.manifest, workspace, {
      knowledgePack: project.knowledgePack,
      assetSourceDir: this.ingestion.assetDirectory(projectId),
      contentOverrides: this.readOverrides(projectId).overrides,
      assetDecisions,
      sectionVariants: this.readSectionVariants(projectId).choices,
      designChoices: { ...this.readDesignChoices(projectId).choices, visualDirection: candidate.directionId },
      referenceInfluence,
      reworkOverrides: overrides,
      projectId,
      factoryRoot: this.factoryRoot,
    });
    const spec = JSON.parse(fs.readFileSync(path.join(workspace, DESIGN_SYSTEM_SPEC_PATH), 'utf8'));

    const revised = {
      ...draft,
      candidateId: revisedId,
      directionLabel: `${candidate.directionLabel} (revision ${plan.iteration})`,
      workspace,
      compositionHash: build.composition.compositionHash,
      designSystemSpecHash: hashOf(spec),
      assetStrategy: candidate.assetStrategy,
      state: 'draft',
      gate: { status: 'not-run', blocking: [], mustAddress: [] },
      review: null,
      outcome: 'pending',
      rationale: null,
      reworkOwner: null,
      // A revision inherits the runtime that authored what it revises, and takes
      // the rework owner as its role. `plan.owner` alone is a role name, and a
      // role name cannot establish independence — a revision recorded under one
      // would be reviewable by the very runtime that produced it.
      provenance: { createdBy: { ...candidate.provenance.createdBy, role: plan.owner }, reviewedBy: null, promotedBy: null, decidedAt: null },
    };

    const stored = this.writeVisualCandidateSet(projectId, attachRevisedCandidate(set, { plan, candidate: revised }));
    await this.store.recordEvent(createEvent({
      projectId,
      type: 'visual.candidate.reworked',
      actor: plan.owner,
      payload: {
        setId: set.setId,
        planId: plan.planId,
        parentCandidateId: candidateId,
        revisedCandidateId: revisedId,
        iteration: plan.iteration,
        failingCriteria: plan.failingCriteria,
        requestedChanges: plan.targets.map((target) => `${target.axis}:${target.from}->${target.to}`),
        customPresentationRequired: Boolean(plan.customPresentation),
        frozenTruthUnchanged: revised.compositionHash === candidate.compositionHash,
      },
    }));
    return { set: stored, plan, revisedCandidateId: revisedId };
  }

  /**
   * Promote one candidate into the project.
   *
   * Promotion is an ordinary durable design choice plus a rebuild. That is the
   * whole mechanism, and it is deliberately small: the generated repository
   * that results is the project's own next build, not a candidate workspace
   * renamed. Every candidate workspace is removed afterwards — the promoted one
   * included — so a project never ends up with four forks of itself and no
   * record of which is the product.
   */
  async promoteVisualCandidate(projectId, candidateId, { promotedBy, rationale = null } = {}) {
    const project = this.requireProject(projectId);
    const set = this.readVisualCandidateSet(projectId);
    if (!set) throw new Error(`Project ${projectId} has no visual candidate set.`);
    const promoted = promoteCandidate(set, candidateId, { promotedBy, rationale, decidedAt: new Date().toISOString() });
    const winner = promoted.candidates.find((entry) => entry.candidateId === candidateId);

    await this.writeDesignChoices(projectId, { visualDirection: winner.directionId });
    const stored = this.writeVisualCandidateSet(projectId, {
      ...promoted,
      // The workspaces go; the evidence and the reasons stay.
      candidates: promoted.candidates.map((entry) => ({ ...entry, workspace: null })),
    });
    removeCandidateWorkspaces(candidateRoot(this.workspacesRoot, project.slug, set.setId));

    await this.store.recordEvent(createEvent({
      projectId,
      type: 'visual.candidate.promoted',
      actor: promotedBy,
      payload: {
        setId: set.setId,
        candidateId,
        directionId: winner.directionId,
        rejected: stored.candidates.filter((entry) => entry.outcome === 'rejected').map((entry) => entry.candidateId),
        rationale,
      },
    }));
    return stored;
  }

  /**
   * The operator-facing preview state. It deliberately carries no host and no
   * port: a remote operator's browser reaches a preview through the supported
   * Console -> Factory boundary at this path, never at a factory-host loopback
   * address it could not resolve anyway.
   */
  /**
   * Whether a preview can actually serve, not whether a process exists.
   *
   * These were the same statement while every generated project booted a Vite
   * dev server in a few hundred milliseconds. A prerendered project's dev
   * server takes seconds, and in that window this reported `running`, the
   * Console's poll mounted the preview frame, its one request reached a port
   * nothing was listening on yet, and the frame kept that error until something
   * else happened to remount it. `starting` is the honest third state: a
   * preview exists and is not yet serving.
   */
  previewStatus(projectId) {
    this.requireProject(projectId);
    const preview = this.previews.get(projectId);
    if (!preview || preview.process.exitCode !== null) return { state: 'stopped', path: null, startedAt: null };
    if (!preview.ready) return { state: 'starting', path: null, startedAt: preview.startedAt };
    return { state: 'running', path: preview.basePath, startedAt: preview.startedAt };
  }

  /**
   * The factory-internal preview destination. Only in-factory callers use it:
   * the preview proxy, which never lets a caller name a destination, and
   * rendered-evidence capture, which runs beside the preview process.
   */
  previewTarget(projectId) {
    this.requireProject(projectId);
    const preview = this.previews.get(projectId);
    if (!preview || preview.process.exitCode !== null) return null;
    // A preview that is still booting has no destination yet. Returning one
    // would make the proxy answer a connection error rather than say plainly
    // that nothing is running there.
    if (!preview.ready) return null;
    return { port: preview.port, basePath: preview.basePath, url: preview.url };
  }

  async startPreview(projectId) {
    const { workspace } = this.requireWorkspace(projectId);
    const existing = this.previewStatus(projectId);
    if (existing.state === 'running' || existing.state === 'starting') return existing;
    if (!fs.existsSync(path.join(workspace, 'node_modules'))) throw new Error('Project dependencies are not installed. Run verification before starting preview.');
    const port = await freeLocalPort();
    // The preview serves under the same path the operator's browser asks for,
    // so every asset, module and route the generated app emits is already
    // addressed through the Console boundary. `--base` is a launch argument:
    // the generated repository stays an ordinary portable project.
    const basePath = previewBasePath(projectId);
    const url = `http://127.0.0.1:${port}${basePath}`;
    // What this build's own template says its dev server needs to stay a
    // supervised child. Astro's dev server, for instance, detaches itself when
    // it believes it is being run by an agent, which would leave the factory
    // holding a process that has already exited while a server it can no longer
    // stop keeps serving a stale build on the port. The template declares the
    // environment that prevents it; the service does not learn what Astro is.
    const previewEnv = this.readProjectRecord(projectId)?.preview?.env ?? {};
    const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--base', basePath], {
      cwd: workspace,
      stdio: 'ignore',
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      env: { ...process.env, ...previewEnv, BROWSER: 'none' },
    });
    const preview = { process: child, port, url, basePath, ready: false, startedAt: new Date().toISOString() };
    this.previews.set(projectId, preview);
    child.once('exit', () => {
      if (this.previews.get(projectId)?.process === child) this.previews.delete(projectId);
    });
    try {
      await waitForPreview(url, child);
      preview.ready = true;
      await this.store.recordEvent(createEvent({ projectId, type: 'preview.started', actor: 'factory-service', payload: { path: basePath, port } }));
      return this.previewStatus(projectId);
    } catch (error) {
      await terminatePreview(child);
      this.previews.delete(projectId);
      throw error;
    }
  }

  async stopPreview(projectId) {
    this.requireProject(projectId);
    const preview = this.previews.get(projectId);
    if (!preview || preview.process.exitCode !== null) {
      this.previews.delete(projectId);
      return { state: 'stopped', path: null, startedAt: null };
    }
    await terminatePreview(preview.process);
    this.previews.delete(projectId);
    await this.store.recordEvent(createEvent({ projectId, type: 'preview.stopped', actor: 'factory-service', payload: { port: preview.port } }));
    return { state: 'stopped', path: null, startedAt: null };
  }

  async close() {
    while (this.previews.size) {
      const projectId = this.previews.keys().next().value;
      await this.stopPreview(projectId);
    }
  }
}
