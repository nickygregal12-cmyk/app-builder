import type { AppBuilderProjectManifest } from '@app-builder/contracts';
import type { SourceReference } from '@app-builder/factory-core';

export type { SourceReference };

// Service transport projections remain local until their contract families are
// migrated to schema-derived packages/contracts. Do not treat these as a
// second authority for the Project Manifest itself.
export type ProjectSummary = {
  id: string;
  name: string;
  type: string;
  slug: string;
  state: string;
  workspacePath: string | null;
  manifestVersion: number;
  knowledgePackHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ControlTask = {
  id: string;
  projectId: string;
  objective: string;
  state: string;
  attempt: number;
  stopReason: string | null;
  latestCheckpointId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BuildEvent = {
  sequence: number;
  id: string;
  type: string;
  projectId: string;
  taskId: string | null;
  actor: string;
  timestamp: string;
  payload: Record<string, unknown>;
  usage: {
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    costGbp: number;
    durationMs: number;
    cacheHit: boolean;
  };
};

export type ProjectMetrics = {
  eventCount: number;
  costGbp: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  interventions: number;
};

export type Checkpoint = {
  id: string;
  projectId: string;
  taskId: string;
  repoRef?: string;
  summary: string;
  nextAction: string;
  artifacts: string[];
  failures: string[];
  createdAt: string;
};

export type PreviewState = {
  state: 'running' | 'stopped';
  url: string | null;
  port: number | null;
  startedAt: string | null;
};

export type IntegrationStatus = { id: string; configured: boolean };
export type SourceGovernanceDecision = 'approve-for-use' | 'reference-only' | 'do-not-use';

export type IngestedSource = {
  id: string;
  kind: string;
  label: string;
  uri: string | null;
  mimeType: string | null;
  sizeBytes: number;
  provenance: string;
  purpose: string | null;
  rightsStatus: string;
  assetStatus: string;
  sourceRole: string;
  sourceChannel: string;
  instructionAuthority: string;
  publishUseAllowed: boolean;
  contentHash: string;
};

export type KnowledgeSummary = {
  packHash: string;
  intelligenceVersion: string;
  sources: IngestedSource[];
  factCount: number;
  assetCount: number;
  chunkCount: number;
  publishableAssetCount: number;
  companyName: string | null;
};

/** Mirrors the service ingestion contract: an http(s) URL to normalise, or
 * inline file content. The Console never sends a filesystem path. */
export type SourceRequest = {
  uri?: string;
  crawl?: boolean;
  maxPages?: number;
  name?: string;
  mimeType?: string;
  contentBase64?: string;
  label?: string;
  purpose?: string;
  approvedForUse?: boolean;
};

export type ContentOverride = {
  sectionId: string;
  bindingKey: string;
  value: string;
  editedAt: string;
  editedBy?: string;
};

/** Mirrors schemas/element-identity.schema.json. The Console never derives an
 * identity itself: it reports the coordinates the preview gave it and the
 * service answers with the resolved element or a refusal. */
export type ElementIdentity = {
  ref: string;
  pageId: string;
  pagePath: string;
  sectionId: string;
  sectionType: string;
  sectionVariant: string;
  componentId: string;
  componentVersion: string;
  componentInstanceId: string;
  elementKey: string;
  elementRole: string;
  bindingKey: string | null;
  editableProperties: string[];
  designTokens: string[];
  provenance: {
    origin: string;
    generated: boolean;
    overridden: boolean;
    overriddenFromOrigin?: string | null;
    sourceIds: string[];
    factIds: string[];
    entityIds: string[];
  };
  sourceLocation: { artifact: string; pointer: string; generatedModule: string; renderer: string };
  assetBinding: { assetId: string; kind: string | null; provenance: string | null; assetStatus: string | null; rightsStatus: string | null } | null;
};

export type ElementResolution = {
  status: 'resolved' | 'unknown' | 'stale' | 'malformed';
  ref: string | null;
  identity: ElementIdentity | null;
  projectId: string;
};

/** Mirrors schemas/rendered-evidence.schema.json. Visual evidence only: a
 * capture shows what a state looks like and never proves a journey completes. */
export type RenderedCapture = {
  id: string;
  evidenceKind: 'visual';
  pageId: string;
  route: string;
  viewport: 'desktop' | 'tablet' | 'mobile';
  state: { axis: string; state: string; risk: 'low' | 'medium' | 'high'; interaction?: string | null; proves: string };
  file: string;
  contentHash: string;
  byteSize: number;
  elementRefs: string[];
};

export type UncoveredState = {
  route: string;
  axis: string;
  state: string;
  risk: 'low' | 'medium' | 'high';
  reason: 'not-visually-provable' | 'needs-a-deterministic-fixture' | 'capability-not-installed';
  detail?: string;
};

export type RenderedEvidence = {
  id: string;
  projectId: string;
  buildRef: string;
  compositionHash: string;
  capturedAt: string;
  viewports: Array<{ name: string; width: number; height: number; deviceScaleFactor: number }>;
  captures: RenderedCapture[];
  uncovered: UncoveredState[];
  setHash: string;
};

export type CompositionSummary = {
  compositionHash: string;
  input?: { manifestVersion: number; knowledgePackHash: string | null };
  pages: Array<{ id: string; path: string; title: string; sectionIds: string[] }>;
  sections: Array<{ id: string; type: string; purpose: string }>;
  warnings: string[];
};

export type WorkspaceSnapshot = {
  project: ProjectSummary;
  sources: SourceReference[];
  tasks: ControlTask[];
  events: BuildEvent[];
  metrics: ProjectMetrics;
  checkpoint: Checkpoint | null;
  preview: PreviewState;
  composition: CompositionSummary | null;
  integrations: IntegrationStatus[];
  knowledge: KnowledgeSummary | null;
  checkpoints: Checkpoint[];
  overrides: ContentOverride[];
  evidence: RenderedEvidence[];
};

const API_ROOT = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.message ?? body.error ?? `Factory service request failed (${response.status}).`);
  return body as T;
}

export async function listProjects() {
  return (await request<{ projects: ProjectSummary[] }>('/projects')).projects;
}

export async function createProject(manifest: object) {
  // factory-core still exposes the pre-3.8 handwritten ProjectManifestV2 type.
  // Runtime validation is schema/Ajv-authoritative; adapt that legacy compile-time
  // shape at this one boundary until factory-core itself consumes the generated
  // contract family. Do not copy manifest fields or enums into the Console.
  const schemaManifest = manifest as unknown as AppBuilderProjectManifest;
  return (await request<{ project: ProjectSummary }>('/projects', { method: 'POST', body: JSON.stringify({ manifest: schemaManifest }) })).project;
}

export async function ingestSources(projectId: string, sources: SourceRequest[]) {
  return await request<{ project: ProjectSummary; knowledge: KnowledgeSummary; added: IngestedSource[] }>(
    `/projects/${encodeURIComponent(projectId)}/sources`,
    { method: 'POST', body: JSON.stringify({ sources }) },
  );
}

export async function saveOverrides(projectId: string, overrides: ContentOverride[]) {
  return await request<{ overrides: ContentOverride[]; composition: { compositionHash: string } | null }>(
    `/projects/${encodeURIComponent(projectId)}/overrides`,
    { method: 'PUT', body: JSON.stringify({ overrides }) },
  );
}

export async function resolveElement(projectId: string, target: { pageId: string; sectionId: string; elementKey: string }) {
  return await request<ElementResolution>(
    `/projects/${encodeURIComponent(projectId)}/element-identity/resolve`,
    { method: 'POST', body: JSON.stringify(target) },
  );
}

export async function listRenderedEvidence(projectId: string) {
  return (await request<{ evidence: RenderedEvidence[] }>(`/projects/${encodeURIComponent(projectId)}/evidence`)).evidence;
}

export async function captureRenderedEvidence(projectId: string) {
  return await request<{ evidence: RenderedEvidence | null; failures: Array<{ id: string; message: string }> }>(
    `/projects/${encodeURIComponent(projectId)}/evidence/capture`,
    { method: 'POST' },
  );
}

/** The service streams the PNG; the Console only needs the address of it. */
export function renderedCaptureUrl(projectId: string, evidenceId: string, captureId: string) {
  return `${API_ROOT}/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(evidenceId)}/captures/${encodeURIComponent(captureId)}`;
}

export async function updateSourceGovernance(projectId: string, sourceId: string, decision: SourceGovernanceDecision) {
  return await request<{ source: SourceReference; project: ProjectSummary }>(
    `/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/governance`,
    { method: 'POST', body: JSON.stringify({ decision }) },
  );
}

export async function generateProject(projectId: string) {
  return (await request<{ project: ProjectSummary }>(`/projects/${encodeURIComponent(projectId)}/generate`, { method: 'POST' })).project;
}

export async function verifyProject(projectId: string) {
  return (await request<{ project: ProjectSummary }>(`/projects/${encodeURIComponent(projectId)}/verify`, { method: 'POST' })).project;
}

export async function startPreview(projectId: string) {
  return (await request<{ preview: PreviewState }>(`/projects/${encodeURIComponent(projectId)}/preview/start`, { method: 'POST' })).preview;
}

export async function stopPreview(projectId: string) {
  return (await request<{ preview: PreviewState }>(`/projects/${encodeURIComponent(projectId)}/preview/stop`, { method: 'POST' })).preview;
}

export async function loadWorkspace(projectId: string): Promise<WorkspaceSnapshot> {
  const id = encodeURIComponent(projectId);
  const [projectResult, manifestResult, tasksResult, eventsResult, metricsResult, checkpointResult, previewResult, compositionResult, integrationsResult, knowledgeResult, checkpointsResult, overridesResult, evidenceResult] = await Promise.all([
    request<{ project: ProjectSummary }>(`/projects/${id}`),
    request<{ manifest: AppBuilderProjectManifest }>(`/projects/${id}/manifest`),
    request<{ tasks: ControlTask[] }>(`/projects/${id}/tasks`),
    request<{ events: BuildEvent[] }>(`/projects/${id}/events`),
    request<{ metrics: ProjectMetrics }>(`/projects/${id}/metrics`),
    request<{ checkpoint: Checkpoint | null }>(`/projects/${id}/checkpoint`),
    request<{ preview: PreviewState }>(`/projects/${id}/preview`),
    request<{ composition: CompositionSummary | null }>(`/projects/${id}/composition`),
    request<{ integrations: IntegrationStatus[] }>('/integrations'),
    request<{ knowledge: KnowledgeSummary | null }>(`/projects/${id}/sources`),
    request<{ checkpoints: Checkpoint[] }>(`/projects/${id}/checkpoints`),
    request<{ overrides: ContentOverride[] }>(`/projects/${id}/overrides`),
    request<{ evidence: RenderedEvidence[] }>(`/projects/${id}/evidence`),
  ]);
  const manifestWithSources = manifestResult.manifest as AppBuilderProjectManifest & { inputs?: { sources?: SourceReference[] } };
  return {
    project: projectResult.project,
    sources: Array.isArray(manifestWithSources.inputs?.sources) ? manifestWithSources.inputs.sources : [],
    tasks: tasksResult.tasks,
    events: eventsResult.events,
    metrics: metricsResult.metrics,
    checkpoint: checkpointResult.checkpoint,
    preview: previewResult.preview,
    composition: compositionResult.composition,
    integrations: integrationsResult.integrations,
    knowledge: knowledgeResult.knowledge,
    checkpoints: checkpointsResult.checkpoints,
    overrides: overridesResult.overrides,
    evidence: evidenceResult.evidence,
  };
}
