import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { assertContract, validateContract } from '@app-builder/contracts';
import { applyContentOverrides, assertEditableElement, assetDecisionsHash, bindingElementKey, elementRef, resolveElementIdentity, stripContentOverrides } from '@app-builder/composition';
import { createCheckpoint, createEvent, createTask, transitionTask } from '@app-builder/control-plane';
import { SourceIngestion, knowledgeSummary } from './ingestion.js';
import { reapplyAssetFocalPoints } from './asset-governance.js';
import { generateComposedProject } from '../../../tooling/lib/composed-generator.mjs';
import { deriveStateMatrix } from '../../../tooling/lib/launch-readiness.mjs';
import { buildEvidenceSet, captureFile, deriveEvidencePlan } from '../../../tooling/lib/rendered-evidence.mjs';
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

export class FactoryService {
  constructor({ store, workspacesRoot, stateRoot, env = process.env }) {
    this.store = store;
    this.workspacesRoot = path.resolve(workspacesRoot);
    this.env = env;
    this.previews = new Map();
    this.ingestion = new SourceIngestion({ stateRoot: stateRoot ?? store.stateRoot });
    // Evidence is a record of what a build rendered, not part of the product,
    // so it lives in service state rather than inside the portable repository.
    this.evidenceRoot = path.resolve(stateRoot ?? store.stateRoot, 'evidence');
    fs.mkdirSync(this.workspacesRoot, { recursive: true });
  }

  createProject({ manifest, knowledgePack = null, id = null }) {
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

  rewriteWorkspaceComposition(workspace, overrides) {
    const file = path.join(workspace, '.app-builder', 'composition.json');
    if (!fs.existsSync(file)) return null;
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Replay from the deterministic baseline so removing an edit restores the
    // generated value rather than leaving the previous override in place.
    const baseline = stripContentOverrides(stored);
    const next = assertContract('composition', applyContentOverrides(baseline, overrides));
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
  // measured against the baseline too. Otherwise saving a sentence would make
  // every address in the build look stale.
  baselineCompositionHash(composition) {
    return composition ? stripContentOverrides(composition).compositionHash : null;
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
      stateMatrix: deriveStateMatrix(composition),
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
    const preview = this.previewStatus(projectId);
    if (preview.state !== 'running' || !preview.url) throw new Error('Rendered evidence is captured from the running preview. Start the preview first.');
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
    const plan = deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition), elementIdentity: this.elementIdentityIndex(projectId) });
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

  async recordOperationalEvent(projectId, type, payload = {}, usage = {}) {
    this.requireProject(projectId);
    return this.store.recordEvent(createEvent({ projectId, type, actor: 'factory-service', payload, usage }));
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
        projectId,
      });
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
        artifacts: ['.app-builder/manifest.json', '.app-builder/composition.json', '.app-builder/recipe-installations.json'],
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

  previewStatus(projectId) {
    this.requireProject(projectId);
    const preview = this.previews.get(projectId);
    if (!preview || preview.process.exitCode !== null) return { state: 'stopped', url: null, port: null, startedAt: null };
    return { state: 'running', url: preview.url, port: preview.port, startedAt: preview.startedAt };
  }

  async startPreview(projectId) {
    const { workspace } = this.requireWorkspace(projectId);
    const existing = this.previewStatus(projectId);
    if (existing.state === 'running') return existing;
    if (!fs.existsSync(path.join(workspace, 'node_modules'))) throw new Error('Project dependencies are not installed. Run verification before starting preview.');
    const port = await freeLocalPort();
    const url = `http://127.0.0.1:${port}`;
    const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: workspace,
      stdio: 'ignore',
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      env: { ...process.env, BROWSER: 'none' },
    });
    const preview = { process: child, port, url, startedAt: new Date().toISOString() };
    this.previews.set(projectId, preview);
    child.once('exit', () => {
      if (this.previews.get(projectId)?.process === child) this.previews.delete(projectId);
    });
    try {
      await waitForPreview(url, child);
      await this.store.recordEvent(createEvent({ projectId, type: 'preview.started', actor: 'factory-service', payload: { url, port } }));
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
      return { state: 'stopped', url: null, port: null, startedAt: null };
    }
    await terminatePreview(preview.process);
    this.previews.delete(projectId);
    await this.store.recordEvent(createEvent({ projectId, type: 'preview.stopped', actor: 'factory-service', payload: { port: preview.port } }));
    return { state: 'stopped', url: null, port: null, startedAt: null };
  }

  async close() {
    while (this.previews.size) {
      const projectId = this.previews.keys().next().value;
      await this.stopPreview(projectId);
    }
  }
}
