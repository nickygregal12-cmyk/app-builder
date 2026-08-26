import type { AppBuilderApprovedIntakeBundle, AppBuilderProjectManifest } from '@app-builder/contracts';
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
  approvedIntakeBundleId: string | null;
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

// The Console never learns which loopback port a preview runs on. It receives a
// same-origin path through the supported Console -> Factory boundary.
export type PreviewState = {
  state: 'running' | 'stopped';
  path: string | null;
  startedAt: string | null;
};

/** Mirrors schemas/approved-intake-bundle.schema.json. The Console carries the
 * bundle between the service and the operator's disk; it never assembles one,
 * because the factory that will replay it is the factory that mints it. */
export type ApprovedIntakeBundle = AppBuilderApprovedIntakeBundle;

export type IntakeBundleDrift = { code: string; severity: 'blocking' | 'notice'; detail: string };

/** What a replay is reusing, in the operator's terms rather than as a hash. */
export type ReplayedIntakeSummary = {
  bundleId: string;
  approvedAt: string;
  projectName: string;
  projectType: string;
  mode: string;
  questionnaireVersion: string;
  answeredQuestions: number;
  totalQuestions: number;
  acceptedDefaults: string[];
  sourceReferences: Array<{ id: string; label: string; kind: string; uri: string | null; rightsStatus: string }>;
  capabilityDecisions: Record<string, string>;
  approvedBuildContractHash: string;
  approvedProjectManifestHash: string;
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

export type AssetDecisionRequest = {
  decision: 'approve' | 'reject' | 'do-not-use' | 'clear';
  rightsDeclaration?: 'owned-by-the-business' | 'licensed-for-publication' | null;
  cropReview?: 'pending' | 'approved' | 'rejected';
  note?: string;
};

/** One ingested image, what it inherited from its source, and what a person
 * decided about it. The two are kept apart: collapsing them would hide whether
 * anyone has actually looked at the asset. */
export type ProjectAsset = {
  id: string;
  sourceId: string;
  sourceLabel: string | null;
  sourceChannel: string;
  kind: string;
  provenance: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  dominantColor: string | null;
  lowResolution: boolean;
  variantCount: number;
  cropCount: number;
  duplicateOf: string | null;
  visualDuplicateOf: string | null;
  inherited: { rightsStatus: string; assetStatus: string; publishUseAllowed: boolean };
  decision: { decision: string; rightsDeclaration: string | null; cropReview: string; decidedAt: string; note: string | null } | null;
  cropReview: string;
  supersededBy: string | null;
  replaces: string | null;
  focalPoint: { x: number; y: number } | null;
  recroppable: boolean;
  rightsStatus: string;
  assetStatus: string;
  publishUseAllowed: boolean;
  rightsDeclarationRequired: boolean;
};

/** One composed section and the presentations its template genuinely renders.
 * A component with a single presentation is not offered at all. */
export type SectionVariantOption = {
  sectionId: string;
  sectionType: string;
  pageId: string | null;
  pagePath: string | null;
  componentId: string;
  componentVersion: string;
  variant: string;
  composedVariant: string;
  chosen: boolean;
  chosenAt: string | null;
  variants: Array<{ id: string; label: string; purpose: string }>;
};

/** The design the live build compiled, and the structured controls offered over
 * it. Every control has a declared set of values; this is a contract, not a
 * stylesheet. */
export type DesignContract = {
  design: { patternId: string; label: string; accentColor: string; maxWidth: string; radius: string; density: string };
  chosen: Record<string, string>;
  controls: Array<{ control: string; label: string; value: string; options: Array<{ id: string; label: string; purpose: string }> }>;
  accentContrastMinimum: number;
};

/** What the live build needs, and what is worth proving about it. Every
 * opportunity is grounded in a launch-readiness finding that already exists. */
export type ProductOpportunity = {
  id: string;
  kind: 'improvement' | 'evidence';
  owningRole: string;
  title: string;
  summary: string[];
  where: string[];
  findingCount: number;
  categories: string[];
  severities: string[];
  guidance: string;
  blockedOn: 'factory' | 'owner';
  ranking: { total: number; value: number; frequency: number; readiness: string; cost: number; risk: number };
};

export type ProductReview = {
  launchable: boolean;
  predictedManualEdits: number;
  summary: { blocker: number; major: number; minor: number; byCategory: Record<string, number>; evidenceGaps: number };
  compositionHash: string | null;
  opportunities: ProductOpportunity[];
  consideredCount: number;
  evidenceOpportunities: ProductOpportunity[];
  evidenceConsideredCount: number;
  stateMatrix: Array<{ page: string; axes: string[]; states: Array<{ axis: string; state: string; risk: string; evidence: string }> }>;
  journeys: Array<{ id: string; entry: string; steps: Array<{ step: string; status: string; detail: string }> }>;
  evidenceId: string | null;
};

export type CompositionSummary = {
  compositionHash: string;
  input?: { manifestVersion: number; knowledgePackHash: string | null; assetDecisionsHash: string | null };
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
  visualCandidates: VisualCandidateSet | null;
  assets: ProjectAsset[];
  assetDecisionsHash: string | null;
  sectionVariants: SectionVariantOption[];
  design: DesignContract | null;
  review: ProductReview | null;
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

export async function listProjectAssets(projectId: string) {
  return await request<{ assets: ProjectAsset[]; assetDecisionsHash: string | null }>(`/projects/${encodeURIComponent(projectId)}/assets`);
}

export async function decideProjectAsset(projectId: string, assetId: string, decision: AssetDecisionRequest) {
  return await request<{ asset: ProjectAsset | null }>(
    `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/decision`,
    { method: 'POST', body: JSON.stringify(decision) },
  );
}

/** A replacement is a different photograph, so its rights declaration arrives
 * with it rather than being carried over from the picture it replaces. */
export async function replaceProjectAsset(projectId: string, assetId: string, source: SourceRequest, rightsDeclaration: 'owned-by-the-business' | 'licensed-for-publication' | null) {
  return await request<{ retired: ProjectAsset | null; replacement: ProjectAsset | null }>(
    `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/replace`,
    { method: 'POST', body: JSON.stringify({ source, rightsDeclaration }) },
  );
}

export async function setAssetFocalPoint(projectId: string, assetId: string, focalPoint: { x: number; y: number }) {
  return await request<{ asset: ProjectAsset | null }>(
    `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/focal-point`,
    { method: 'POST', body: JSON.stringify({ focalPoint }) },
  );
}

/** The service streams the bytes; the Console only needs the address. */
export function assetPreviewUrl(projectId: string, assetId: string) {
  return `${API_ROOT}/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/preview`;
}

export async function loadProductReview(projectId: string) {
  return (await request<{ review: ProductReview | null }>(`/projects/${encodeURIComponent(projectId)}/product-review`)).review;
}

export async function updateDesignContract(projectId: string, choices: Record<string, string | null>) {
  return (await request<{ design: DesignContract | null }>(
    `/projects/${encodeURIComponent(projectId)}/design`,
    { method: 'POST', body: JSON.stringify({ choices }) },
  )).design;
}

export async function listSectionVariants(projectId: string) {
  return (await request<{ sections: SectionVariantOption[] }>(`/projects/${encodeURIComponent(projectId)}/section-variants`)).sections;
}

export async function chooseSectionVariant(projectId: string, sectionId: string, variant: string | null) {
  return (await request<{ sections: SectionVariantOption[] }>(
    `/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionId)}/variant`,
    { method: 'POST', body: JSON.stringify({ variant }) },
  )).sections;
}

/**
 * Mirrors schemas/visual-candidate-set.schema.json. Several presentations of
 * one frozen truth, and the record of which one was promoted.
 */
export type VisualCandidate = {
  candidateId: string;
  directionId: string;
  directionLabel: string;
  state: 'draft' | 'rendered' | 'deterministic-pass' | 'deterministic-blocked' | 'reviewed' | 'promoted' | 'rejected';
  artDirection: { dimensions: Record<string, string>; responsive: Record<string, string> };
  signature: { axes: Record<string, string | null>; sequence: Array<{ pageId: string; presentation: string[] }> };
  compositionHash: string;
  assetStrategy: string;
  evidenceId: string | null;
  designLint: { counts: Record<string, number>; findings: Array<{ rule: string; severity: string; detail: string }> } | null;
  gate: { status: 'blocked' | 'review-required' | 'clear' | 'not-run'; blocking: Array<{ rule: string; detail: string }>; mustAddress: string[] };
  review: { verdict: string; reviewedBy: string; rationale?: string | null; addressedRules?: string[] } | null;
  outcome: 'pending' | 'promoted' | 'rejected';
  rationale: string | null;
};

export type VisualCandidateSet = {
  setId: string;
  projectId: string;
  createdAt: string;
  frozenTruth: { projectType: string; manifestVersion: number; knowledgePackHash: string | null; baselineCompositionHash: string };
  assetReadiness: { strategy: string; supportsImageryLed: boolean; strategyReason: string };
  diversity: { distinct: boolean; minimumDifferingPlanes: number; duplicates: Array<{ a: string; b: string; reason: string; detail: string }> };
  refusedDirections: Array<{ directionId: string; reason: string; detail: string }>;
  candidates: VisualCandidate[];
  promotedCandidateId: string | null;
};

export type VisualReviewPacket = {
  candidateId: string;
  directionLabel: string;
  purpose: string | null;
  gateStatus: string;
  settledByRules: Array<{ rule: string; severity: string; detail: string }>;
  mustAddress: string[];
  criteria: Array<{ id: string; question: string }>;
  siblings: Array<{ candidateId: string; directionLabel: string; evidenceId: string | null }>;
};

export async function readVisualCandidates(projectId: string) {
  return (await request<{ set: VisualCandidateSet | null }>(`/projects/${encodeURIComponent(projectId)}/visual-candidates`)).set;
}

export async function generateVisualCandidates(projectId: string) {
  return (await request<{ set: VisualCandidateSet }>(`/projects/${encodeURIComponent(projectId)}/visual-candidates`, { method: 'POST', body: JSON.stringify({}) })).set;
}

export async function captureVisualCandidateEvidence(projectId: string) {
  return (await request<{ set: VisualCandidateSet }>(`/projects/${encodeURIComponent(projectId)}/visual-candidates/capture`, { method: 'POST' })).set;
}

export async function readVisualReviewPacket(projectId: string, candidateId: string) {
  return (await request<{ packet: VisualReviewPacket }>(`/projects/${encodeURIComponent(projectId)}/visual-candidates/${encodeURIComponent(candidateId)}/packet`)).packet;
}

export async function recordVisualReview(projectId: string, candidateId: string, review: { verdict: string; reviewedBy: string; addressedRules: string[]; rationale: string }) {
  return (await request<{ set: VisualCandidateSet }>(
    `/projects/${encodeURIComponent(projectId)}/visual-candidates/${encodeURIComponent(candidateId)}/review`,
    { method: 'POST', body: JSON.stringify(review) },
  )).set;
}

export async function promoteVisualCandidate(projectId: string, candidateId: string, decision: { promotedBy: string; rationale: string }) {
  return (await request<{ set: VisualCandidateSet }>(
    `/projects/${encodeURIComponent(projectId)}/visual-candidates/${encodeURIComponent(candidateId)}/promote`,
    { method: 'POST', body: JSON.stringify(decision) },
  )).set;
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

/** Record an approved intake durably. The service builds the contract and
 * manifest, so what comes back is what a rerun will actually replay. */
export async function approveIntake(intake: {
  projectType: string;
  mode: string;
  answers: Record<string, unknown>;
  sourceReferences?: SourceReference[];
  capabilityDecisions?: Record<string, string>;
  feedback?: unknown[];
}) {
  return (await request<{ bundle: ApprovedIntakeBundle }>('/intake-bundles', { method: 'POST', body: JSON.stringify({ intake }) })).bundle;
}

/** Start a fresh run from an approved intake. The project is new — new tasks,
 * new build, new evidence, new checkpoints — and only the decisions are reused. */
export async function replayIntakeBundle(bundle: ApprovedIntakeBundle) {
  return await request<{ project: ProjectSummary; reused: ReplayedIntakeSummary; drift: IntakeBundleDrift[] }>(
    '/intake-bundles/replay',
    { method: 'POST', body: JSON.stringify({ bundle }) },
  );
}

export async function loadIntakeBundle(projectId: string) {
  return (await request<{ bundle: ApprovedIntakeBundle | null }>(`/projects/${encodeURIComponent(projectId)}/intake-bundle`)).bundle;
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
  const [projectResult, manifestResult, tasksResult, eventsResult, metricsResult, checkpointResult, previewResult, compositionResult, integrationsResult, knowledgeResult, checkpointsResult, overridesResult, evidenceResult, assetsResult, variantsResult, designResult, reviewResult, candidatesResult] = await Promise.all([
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
    request<{ assets: ProjectAsset[]; assetDecisionsHash: string | null }>(`/projects/${id}/assets`),
    request<{ sections: SectionVariantOption[] }>(`/projects/${id}/section-variants`),
    request<{ design: DesignContract | null }>(`/projects/${id}/design`),
    request<{ review: ProductReview | null }>(`/projects/${id}/product-review`),
    request<{ set: VisualCandidateSet | null }>(`/projects/${id}/visual-candidates`),
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
    visualCandidates: candidatesResult.set,
    assets: assetsResult.assets,
    assetDecisionsHash: assetsResult.assetDecisionsHash,
    sectionVariants: variantsResult.sections,
    design: designResult.design,
    review: reviewResult.review,
  };
}
