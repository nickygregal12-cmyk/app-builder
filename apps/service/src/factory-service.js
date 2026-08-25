import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { validateContract } from '@app-builder/contracts';
import { createCheckpoint, createEvent, createTask, transitionTask } from '@app-builder/control-plane';
import { generateComposedProject } from '../../../tooling/lib/composed-generator.mjs';
import { validateManifest } from '../../../tooling/lib/manifest.mjs';
import { recordRecipeInstallations } from '../../../tooling/lib/recipe-upgrades.mjs';

function safeChild(root, name) {
  const base = path.resolve(root);
  const target = path.resolve(base, name);
  if (target === base || !target.startsWith(`${base}${path.sep}`)) throw new Error(`Unsafe workspace name: ${name}`);
  return target;
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
  constructor({ store, workspacesRoot, env = process.env }) {
    this.store = store;
    this.workspacesRoot = path.resolve(workspacesRoot);
    this.env = env;
    this.previews = new Map();
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
  listProjects() { return this.store.listProjects().map(summary); }
  listTasks(projectId) { this.requireProject(projectId); return this.store.listTasks(projectId); }
  listEvents(projectId, options) { this.requireProject(projectId); return this.store.listEvents(projectId, options); }
  metrics(projectId) { this.requireProject(projectId); return this.store.metrics(projectId); }
  latestCheckpoint(projectId) { this.requireProject(projectId); return this.store.latestCheckpoint(projectId); }

  getComposition(projectId) {
    const project = this.requireProject(projectId);
    if (!project.workspacePath) return null;
    const file = path.join(project.workspacePath, '.app-builder', 'composition.json');
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
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

  async generateProject(projectId) {
    let project = this.requireProject(projectId);
    if (project.state === 'generating') throw new Error('Project generation is already running.');
    const workspace = safeChild(this.workspacesRoot, project.slug);
    if (fs.existsSync(workspace)) throw new Error(`Refusing to overwrite existing project workspace: ${workspace}`);

    let task = createTask({
      projectId,
      objective: `Generate standalone project ${project.name}`,
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
    await this.store.recordEvent(createEvent({ projectId, taskId: task.id, type: 'build.started', actor: 'factory-service', payload: { manifestVersion: project.manifest.schemaVersion ?? 1, knowledgePackHash: project.knowledgePack?.packHash ?? null } }));

    try {
      const { plan, composition } = generateComposedProject(project.manifest, workspace, { knowledgePack: project.knowledgePack });
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
        payload: { workspace, templateId: plan.template.id, recipes: plan.recipes.map((recipe) => recipe.id), adapters: plan.adapters.map((adapter) => adapter.id) },
        usage: { durationMs: Date.now() - started },
      }));

      const checkpoint = createCheckpoint({
        projectId,
        taskId: task.id,
        repoRef: workspace,
        summary: `Generated ${project.name} from Manifest v${project.manifest.schemaVersion ?? 1}${project.knowledgePack ? ' and trusted knowledge pack' : ''}.`,
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
