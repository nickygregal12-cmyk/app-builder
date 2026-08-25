import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { FactoryServiceClient } from './factory-client.js';

const projectIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const projectInput = z.object({ projectId: projectIdSchema });

export const MCP_TOOL_BINDINGS = Object.freeze([
  { name: 'project_list', serviceTool: 'project.list', mutating: false },
  { name: 'project_create', serviceTool: 'project.create', mutating: true },
  { name: 'project_read', serviceTool: 'project.read', mutating: false },
  { name: 'project_manifest_read', serviceTool: 'project.manifest.read', mutating: false },
  { name: 'project_knowledge_read', serviceTool: 'project.knowledge.read', mutating: false },
  { name: 'project_composition_read', serviceTool: 'project.composition.read', mutating: false },
  { name: 'project_generate', serviceTool: 'project.generate', mutating: true },
  { name: 'project_verify', serviceTool: 'project.verify', mutating: true },
  { name: 'project_tasks_read', serviceTool: 'project.tasks.read', mutating: false },
  { name: 'project_events_read', serviceTool: 'project.events.read', mutating: false },
  { name: 'project_metrics_read', serviceTool: 'project.metrics.read', mutating: false },
  { name: 'project_checkpoint_read', serviceTool: 'project.checkpoint.read', mutating: false },
  { name: 'project_preview_status', serviceTool: 'project.preview.read', mutating: false },
  { name: 'project_preview_start', serviceTool: 'project.preview.start', mutating: true },
  { name: 'project_preview_stop', serviceTool: 'project.preview.stop', mutating: true },
  { name: 'integration_status_read', serviceTool: 'integration.status.read', mutating: false },
]);

function result(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function toolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function invoke(operation) {
  return async (input) => {
    try {
      return result(await operation(input));
    } catch (error) {
      return toolError(error);
    }
  };
}

function annotations(mutating) {
  return {
    readOnlyHint: !mutating,
    destructiveHint: false,
    idempotentHint: !mutating,
    openWorldHint: false,
  };
}

export function createAppBuilderMcpServer({ client = new FactoryServiceClient() } = {}) {
  const server = new McpServer({ name: 'app-builder', version: '0.1.0' });

  server.registerTool('project_list', {
    description: 'List durable App Builder projects from the local factory service.',
    inputSchema: z.object({}),
    annotations: annotations(false),
  }, invoke(() => client.listProjects()));

  server.registerTool('project_create', {
    description: 'Create a durable App Builder project from a validated Project Manifest and optional knowledge pack.',
    inputSchema: z.object({
      manifest: z.record(z.string(), z.unknown()),
      knowledgePack: z.record(z.string(), z.unknown()).nullable().optional(),
      id: projectIdSchema.nullable().optional(),
    }),
    annotations: annotations(true),
  }, invoke((input) => client.createProject(input)));

  server.registerTool('project_read', {
    description: 'Read durable project state.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.readProject(projectId)));

  server.registerTool('project_manifest_read', {
    description: 'Read the Project Manifest owned by a durable project.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.readManifest(projectId)));

  server.registerTool('project_knowledge_read', {
    description: 'Read the trusted knowledge pack attached to a project.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.readKnowledge(projectId)));

  server.registerTool('project_composition_read', {
    description: 'Read the current deterministic page and section composition for a project.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.readComposition(projectId)));

  server.registerTool('project_generate', {
    description: 'Run the deterministic factory generation task for an existing durable project.',
    inputSchema: projectInput,
    annotations: annotations(true),
  }, invoke(({ projectId }) => client.generateProject(projectId)));

  server.registerTool('project_verify', {
    description: 'Run independent install, check and build verification for the generated project.',
    inputSchema: projectInput,
    annotations: annotations(true),
  }, invoke(({ projectId }) => client.verifyProject(projectId)));

  server.registerTool('project_tasks_read', {
    description: 'Read durable factory tasks for a project.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.readTasks(projectId)));

  server.registerTool('project_events_read', {
    description: 'Read durable project events after an optional event sequence.',
    inputSchema: z.object({ projectId: projectIdSchema, after: z.number().int().nonnegative().optional() }),
    annotations: annotations(false),
  }, invoke(({ projectId, after = 0 }) => client.readEvents(projectId, { after }))));

  server.registerTool('project_metrics_read', {
    description: 'Read duration, token, cost, intervention and event metrics for a project.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.readMetrics(projectId)));

  server.registerTool('project_checkpoint_read', {
    description: 'Read the latest durable project checkpoint.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.readCheckpoint(projectId)));

  server.registerTool('project_preview_status', {
    description: 'Read service-managed local preview status.',
    inputSchema: projectInput,
    annotations: annotations(false),
  }, invoke(({ projectId }) => client.previewStatus(projectId)));

  server.registerTool('project_preview_start', {
    description: 'Start the service-managed loopback preview for a verified generated project.',
    inputSchema: projectInput,
    annotations: annotations(true),
  }, invoke(({ projectId }) => client.startPreview(projectId)));

  server.registerTool('project_preview_stop', {
    description: 'Stop the service-managed loopback preview for a project.',
    inputSchema: projectInput,
    annotations: annotations(true),
  }, invoke(({ projectId }) => client.stopPreview(projectId)));

  server.registerTool('integration_status_read', {
    description: 'Read configured/not-configured integration status without returning secret values.',
    inputSchema: z.object({}),
    annotations: annotations(false),
  }, invoke(() => client.integrationStatus()));

  return server;
}
