export const FACTORY_TOOL_CONTRACT_VERSION = 3;

export const FACTORY_TOOLS = Object.freeze([
  { name: 'project.list', method: 'GET', path: '/projects', mutating: false, approvalRequired: false },
  { name: 'project.create', method: 'POST', path: '/projects', mutating: true, approvalRequired: false },
  { name: 'project.read', method: 'GET', path: '/projects/{projectId}', mutating: false, approvalRequired: false },
  { name: 'project.manifest.read', method: 'GET', path: '/projects/{projectId}/manifest', mutating: false, approvalRequired: false },
  { name: 'project.knowledge.read', method: 'GET', path: '/projects/{projectId}/knowledge-pack', mutating: false, approvalRequired: false },
  { name: 'project.sources.read', method: 'GET', path: '/projects/{projectId}/sources', mutating: false, approvalRequired: false },
  { name: 'project.sources.ingest', method: 'POST', path: '/projects/{projectId}/sources', mutating: true, approvalRequired: false },
  { name: 'project.composition.read', method: 'GET', path: '/projects/{projectId}/composition', mutating: false, approvalRequired: false },
  { name: 'project.generate', method: 'POST', path: '/projects/{projectId}/generate', mutating: true, approvalRequired: false },
  { name: 'project.verify', method: 'POST', path: '/projects/{projectId}/verify', mutating: true, approvalRequired: false },
  { name: 'project.tasks.read', method: 'GET', path: '/projects/{projectId}/tasks', mutating: false, approvalRequired: false },
  { name: 'project.events.read', method: 'GET', path: '/projects/{projectId}/events', mutating: false, approvalRequired: false },
  { name: 'project.metrics.read', method: 'GET', path: '/projects/{projectId}/metrics', mutating: false, approvalRequired: false },
  { name: 'project.checkpoint.read', method: 'GET', path: '/projects/{projectId}/checkpoint', mutating: false, approvalRequired: false },
  { name: 'project.checkpoints.read', method: 'GET', path: '/projects/{projectId}/checkpoints', mutating: false, approvalRequired: false },
  { name: 'project.preview.read', method: 'GET', path: '/projects/{projectId}/preview', mutating: false, approvalRequired: false },
  { name: 'project.preview.start', method: 'POST', path: '/projects/{projectId}/preview/start', mutating: true, approvalRequired: false },
  { name: 'project.preview.stop', method: 'POST', path: '/projects/{projectId}/preview/stop', mutating: true, approvalRequired: false },
  { name: 'integration.status.read', method: 'GET', path: '/integrations', mutating: false, approvalRequired: false },
]);

export function factoryToolContract() {
  return { schemaVersion: 1, contractVersion: FACTORY_TOOL_CONTRACT_VERSION, tools: FACTORY_TOOLS.map((tool) => ({ ...tool })) };
}
