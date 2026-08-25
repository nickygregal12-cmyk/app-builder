import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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

export class FactoryService {
  constructor({ store, workspacesRoot }) {
    this.store = store;
    this.workspacesRoot = path.resolve(workspacesRoot);
    fs.mkdirSync(this.workspacesRoot, { recursive: true });
  }

  createProject({ manifest, knowledgePack = null, id = null }) {
    const errors = validateManifest(manifest);
    if (errors.length) throw new Error(`Invalid project manifest: ${errors.join('; ')}`);
    if (knowledgePack && knowledgePack.schemaVersion !== 1) throw new Error('Unsupported knowledge-pack schema version.');
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

  listProjects() { return this.store.listProjects().map(summary); }
  listTasks(projectId) { this.requireProject(projectId); return this.store.listTasks(projectId); }
  listEvents(projectId, options) { this.requireProject(projectId); return this.store.listEvents(projectId, options); }
  metrics(projectId) { this.requireProject(projectId); return this.store.metrics(projectId); }
  latestCheckpoint(projectId) { this.requireProject(projectId); return this.store.latestCheckpoint(projectId); }

  requireProject(id) {
    const project = this.store.getProject(id);
    if (!project) throw new Error(`Unknown project: ${id}`);
    return project;
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
        nextAction: 'Run generated project checks and preview acceptance.',
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
}
