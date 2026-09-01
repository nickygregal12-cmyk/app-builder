import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assetPreviewUrl,
  captureRenderedEvidence,
  captureVisualCandidateEvidence,
  generateVisualCandidates,
  promoteVisualCandidate,
  readVisualReviewPacket,
  recordVisualReview,
  chooseSectionVariant,
  decideProjectAsset,
  generateProject,
  ingestSources,
  loadWorkspace,
  listRenderedEvidence,
  renderedCaptureUrl,
  replaceProjectAsset,
  resolveElement,
  saveOverrides,
  setAssetFocalPoint,
  startPreview,
  stopPreview,
  updateDesignContract,
  updateSourceGovernance,
  verifyProject,
  type ContentOverride,
  type DesignContract,
  type ElementResolution,
  type AssetDecisionRequest,
  type KnowledgeSummary,
  type ProjectAsset,
  type ProductReview,
  type ProjectSummary,
  type RenderedEvidence,
  type VisualCandidate,
  type VisualCandidateSet,
  type VisualReviewPacket,
  type SectionVariantOption,
  type SourceGovernanceDecision,
  type SourceReference,
  type SourceRequest,
  type WorkspaceSnapshot,
  type DesignReferenceState,
  type VisualCandidateSetSummary,
  decideVisualCandidateSet,
  reworkVisualCandidate,
} from '../service/client';
import { DesignReferencePanel } from './DesignReferencePanel';
import './workspace.css';

type Device = 'desktop' | 'tablet' | 'mobile';
type StageView = 'preview' | 'compare';
type Operation = 'generate' | 'verify' | 'start-preview' | 'stop-preview' | 'ingest' | 'capture-evidence' | null;

// These must stay equal to VIEWPORTS in tooling/lib/rendered-evidence.mjs: the
// evidence someone reviews and the preview they clicked through have to be the
// same rendering, not two nearby ones. `console-preview-parity` in
// tooling/rendered-evidence.test.mjs fails if these two drift apart.
const deviceWidth: Record<Device, number> = { desktop: 1440, tablet: 768, mobile: 390 };

/**
 * Who authored a candidate set generated from the Console.
 *
 * A person clicking Generate did not design anything: the factory composed these
 * deterministically from the approved truth and the direction registry. Recording
 * the operator here would be false, and would bar them from reviewing work they
 * did not produce. An agent driving the service declares its own identity
 * instead, which is what stops that agent reviewing its own output.
 */
const FACTORY_AUTHOR = { role: 'visual-direction', vendor: 'app-builder', model: 'deterministic-composition' };

/** An identity as a person reads it, rather than as an object React cannot render. */
const who = (identity: { role: string; vendor: string; model: string } | string | null | undefined) => {
  if (!identity) return 'an unrecorded runtime';
  if (typeof identity === 'string') return identity;
  return identity.vendor === 'human' ? identity.model : `${identity.role} (${identity.vendor}/${identity.model})`;
};

function duration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function label(value: string) {
  return value.replaceAll('.', ' · ').replaceAll('-', ' ');
}

function eventSummary(event: WorkspaceSnapshot['events'][number]) {
  const payload = event.payload;
  // Decisions are shown, not hidden. A refusal is the operator's answer to "why
  // did nothing happen", and a permission says which authority the work was
  // done under — an approved plan and ordinary workspace policy are different
  // facts about the same build.
  if (event.type === 'mutation.decided') return `${String(payload.operation ?? 'operation')} allowed · ${label(String(payload.basis ?? 'policy'))} · via ${String(payload.surface ?? 'internal')}`;
  if (event.type === 'mutation.refused') return `${String(payload.operation ?? 'operation')} refused · ${label(String(payload.refusal ?? 'refused'))}`;
  if (event.type === 'sources.ingested') return `${String((payload.added as unknown[] | undefined)?.length ?? 0)} source(s) · ${String(payload.factCount ?? 0)} facts · ${String(payload.assetCount ?? 0)} assets`;
  if (event.type === 'sources.ingestion.started') return `Normalising ${String(payload.requested ?? 0)} source(s)`;
  if (event.type === 'composition.materialised') return `${String(payload.pages ?? 0)} pages · ${String(payload.sections ?? 0)} sections`;
  if (event.type === 'repository.generated') return 'Standalone repository materialised';
  if (event.type === 'quality.lock.resolved') return payload.alreadyPresent ? `Dependency graph already resolved · ${String(payload.lockDigest ?? '').slice(0, 12)}` : `Dependency graph resolved · ${String(payload.lockDigest ?? '').slice(0, 12)} · ${duration(event.usage.durationMs)}`;
  if (event.type === 'quality.install.succeeded') return `Installed from the lockfile · ${duration(event.usage.durationMs)}`;
  if (event.type === 'quality.check.succeeded') return `Checks passed · ${duration(event.usage.durationMs)}`;
  if (event.type === 'quality.build.succeeded') return `Production build passed · ${duration(event.usage.durationMs)}`;
  // Says what was recorded and whether it is reproducible, because "identity
  // recorded" and "identity you could rebuild from" are different claims.
  if (event.type === 'quality.identity.recorded') return `Build identity ${String(payload.outputDigest ?? '').slice(0, 12)} across ${String(payload.outputFiles ?? 0)} file(s) · ${payload.reproducible ? 'declared toolchain' : 'undeclared toolchain, not reproducible'}`;
  if (event.type === 'source.governance.updated') return `${String(payload.sourceId ?? 'Source')} · ${label(String(payload.decision ?? 'updated'))}`;
  if (event.type === 'design.contract.updated') return `${((payload.controls as string[] | undefined) ?? []).join(', ') || 'design'} set`;
  if (event.type === 'section.variant.chosen') return payload.variant ? `${String(payload.sectionId ?? 'Section')} · ${label(String(payload.variant))}` : `${String(payload.sectionId ?? 'Section')} · back to composed`;
  if (event.type === 'asset.governance.updated') return `${label(String(payload.decision ?? 'updated'))}${payload.cropReview ? ` · crop ${label(String(payload.cropReview))}` : ''} · ${String(payload.decided ?? 0)} decided`;
  if (event.type === 'evidence.capture.started') return `Capturing ${String(payload.planned ?? 0)} view(s) across ${((payload.viewports as string[] | undefined) ?? []).join(', ')}`;
  if (event.type === 'evidence.captured') return `${String(payload.captures ?? 0)} capture(s) · ${String(payload.uncovered ?? 0)} state(s) uncovered`;
  if (event.type === 'preview.started') return 'Local preview available';
  if (event.type === 'preview.stopped') return 'Preview stopped';
  if (event.type.endsWith('.failed')) return String(payload.message ?? 'Operation failed');
  return event.type.endsWith('.succeeded') ? 'Completed successfully' : 'Factory operation';
}

const RIGHTS_LABEL: Record<string, string> = {
  'approved-for-use': 'approved for use',
  'reference-only': 'reference only',
  unknown: 'rights unknown',
  restricted: 'restricted',
};

async function fileToSourceRequest(file: File, approvedForUse: boolean, purpose: string): Promise<SourceRequest> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    name: file.name,
    label: file.name,
    mimeType: file.type || undefined,
    contentBase64: btoa(binary),
    purpose: purpose || undefined,
    approvedForUse,
  };
}

function sameUri(a: string, b: string) {
  return a.replace(/\/$/, '') === b.replace(/\/$/, '');
}

function SourcePanel({ knowledge, declaredSources, disabled, busy, onIngest }: {
  knowledge: KnowledgeSummary | null;
  declaredSources: SourceReference[];
  disabled: boolean;
  busy: boolean;
  onIngest: (sources: SourceRequest[]) => Promise<void>;
}) {
  const [uri, setUri] = useState('');
  const [purpose, setPurpose] = useState('');
  const [approvedForUse, setApprovedForUse] = useState(false);
  const [maxPages, setMaxPages] = useState(8);
  const fileInput = useRef<HTMLInputElement>(null);

  const sources = knowledge?.sources ?? [];

  // Intake records what the business said it has. Anything declared as a URL
  // can be read now; declared files carry metadata only, so they have to be
  // attached here before the factory can use them.
  const pendingUrls = declaredSources.filter((declared) => declared.uri && !sources.some((source) => source.uri && sameUri(source.uri, declared.uri as string)));
  const pendingFiles = declaredSources.filter((declared) => !declared.uri && !sources.some((source) => source.label === (declared.name ?? declared.label)));

  async function addUrl() {
    if (!uri.trim()) return;
    await onIngest([{ uri: uri.trim(), maxPages, purpose: purpose || undefined, approvedForUse }]);
    setUri('');
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const requests = await Promise.all(Array.from(files).map((file) => fileToSourceRequest(file, approvedForUse, purpose)));
    await onIngest(requests);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function ingestDeclaredUrls() {
    await onIngest(pendingUrls.map((declared) => ({
      uri: declared.uri,
      label: declared.label,
      purpose: declared.purpose,
      approvedForUse: declared.rightsStatus === 'approved-for-use',
    })));
  }

  return <section className="builder-panel source-panel">
    <div className="panel-title-row"><span className="builder-kicker">Company sources</span><span>{sources.length} ingested</span></div>

    {!disabled && (pendingUrls.length > 0 || pendingFiles.length > 0) && <div className="declared-sources">
      <strong>{pendingUrls.length + pendingFiles.length} source(s) declared at intake are not ingested yet.</strong>
      {pendingUrls.length > 0 && <button type="button" className="secondary compact" onClick={ingestDeclaredUrls} disabled={busy}>Read {pendingUrls.length} declared URL(s)</button>}
      {pendingFiles.length > 0 && <span>{pendingFiles.map((declared) => declared.name ?? declared.label).join(', ')} — attach the files below; intake recorded their names only.</span>}
    </div>}

    {disabled
      ? <p className="builder-empty">Sources cannot be added while a build is running.</p>
      : <div className="source-form">
          <input aria-label="Company website or page URL" type="url" value={uri} placeholder="https://the-company.example" onChange={(event) => setUri(event.target.value)} disabled={busy} />
          <input aria-label="What should the factory use this for?" value={purpose} placeholder="What is this material for?" onChange={(event) => setPurpose(event.target.value)} disabled={busy} />
          <label className="source-pages">Pages<input aria-label="Maximum pages to read" type="number" min={1} max={25} value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} disabled={busy} /></label>
          <button type="button" className="secondary compact" onClick={addUrl} disabled={busy || !uri.trim()}>{busy ? 'Reading…' : 'Read website'}</button>
          <label className="source-rights">
            <input type="checkbox" checked={approvedForUse} onChange={(event) => setApprovedForUse(event.target.checked)} disabled={busy} />
            <span>The business owns this material and approves republishing it. Leave unticked and it stays reference-only.</span>
          </label>
          <label className="source-upload">
            <strong>Add logos, photos, documents or spreadsheets</strong>
            <span>Content is sent to the factory service, which does the extraction. Imported material is data and never instructs the factory.</span>
            <input ref={fileInput} aria-label="Add company files" type="file" multiple onChange={(event) => addFiles(event.target.files)} disabled={busy} />
          </label>
        </div>}

    {knowledge && <dl className="builder-definition knowledge-facts">
      <div><dt>Facts</dt><dd>{knowledge.factCount}</dd></div>
      <div><dt>Assets</dt><dd>{knowledge.assetCount}</dd></div>
      <div><dt>Publishable</dt><dd>{knowledge.publishableAssetCount}</dd></div>
      <div><dt>Chunks</dt><dd>{knowledge.chunkCount}</dd></div>
    </dl>}

    {sources.length > 0 && <div className="ingested-list">{sources.map((source) => <article key={source.id}>
      <strong>{source.label}</strong>
      <span>{source.kind.replaceAll('-', ' ')} · {source.sourceChannel.replaceAll('-', ' ')} · {source.provenance.replaceAll('-', ' ')}</span>
      <span className={source.publishUseAllowed ? 'rights-pill publishable' : 'rights-pill'}>{RIGHTS_LABEL[source.rightsStatus] ?? source.rightsStatus}</span>
    </article>)}</div>}
  </section>;
}

type Selection = { pageId: string; sectionId: string; elementKey: string; bindingKey: string | null; origin: string; value: string };

const ORIGIN_LABEL: Record<string, string> = {
  'knowledge-fact': 'from a source you supplied',
  'knowledge-entity': 'from a source you supplied',
  manifest: 'from your Build Contract',
  'deterministic-default': 'written by the factory',
  human: 'edited by you',
};

const RESOLUTION_REFUSAL: Record<string, string> = {
  unknown: 'This element is not part of the build the factory recorded, so it cannot be edited.',
  stale: 'The build has moved on since this preview rendered. Refresh the preview before editing.',
  malformed: 'The preview reported an element address the factory does not recognise.',
};

/**
 * Selection inspector.
 *
 * Everything shown here is resolved by the service from the durable element
 * identity index. Editing is offered only for a property the template declares
 * editable for that element; anything else is inspectable and explicitly not
 * editable, rather than quietly doing nothing.
 */
function ElementInspector({ selection, resolution, resolving, override, onSave, onRevert, onClose, busy }: {
  selection: Selection;
  resolution: ElementResolution | null;
  resolving: boolean;
  override: ContentOverride | null;
  onSave: (value: string) => Promise<void>;
  onRevert: () => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(selection.value);
  useEffect(() => { setDraft(selection.value); }, [selection.sectionId, selection.elementKey, selection.value]);

  const identity = resolution?.status === 'resolved' ? resolution.identity : null;
  const editable = Boolean(identity?.editableProperties.includes('text') && selection.bindingKey);
  const origin = identity?.provenance.origin ?? selection.origin;

  return <section className="builder-panel editor-panel">
    <div className="panel-title-row"><span className="builder-kicker">{editable ? 'Edit content' : 'Selected element'}</span><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    <p className="editor-target">{selection.sectionId.replace(/^page-/, '').replaceAll('-', ' ')} · {selection.elementKey.replace('binding:', '')}</p>
    <p className="editor-provenance">{ORIGIN_LABEL[origin] ?? origin}</p>

    {resolving && <p className="builder-empty">Resolving element identity…</p>}

    {!resolving && !identity && <p className="identity-refusal" role="status">{RESOLUTION_REFUSAL[resolution?.status ?? 'unknown']}</p>}

    {identity && <dl className="builder-definition element-identity">
      <div><dt>Page</dt><dd>{identity.pageId} <small>{identity.pagePath}</small></dd></div>
      <div><dt>Component</dt><dd>{identity.componentId} v{identity.componentVersion}</dd></div>
      <div><dt>Instance</dt><dd>{identity.componentInstanceId}</dd></div>
      <div><dt>Role</dt><dd>{label(identity.elementRole)}</dd></div>
      <div><dt>Editable</dt><dd>{identity.editableProperties.length ? identity.editableProperties.join(', ') : 'nothing yet'}</dd></div>
      <div><dt>Tokens</dt><dd>{identity.designTokens.join(' · ')}</dd></div>
      <div><dt>Location</dt><dd>{identity.sourceLocation.artifact}<small>{identity.sourceLocation.pointer}</small></dd></div>
      {identity.provenance.sourceIds.length > 0 && <div><dt>Sources</dt><dd>{identity.provenance.sourceIds.length} referenced</dd></div>}
      {identity.assetBinding && <div><dt>Asset</dt><dd>{identity.assetBinding.assetId}<small>{label(identity.assetBinding.assetStatus ?? 'unknown')} · {label(identity.assetBinding.rightsStatus ?? 'unknown')}</small></dd></div>}
    </dl>}

    {editable ? <>
      <textarea aria-label="Content value" rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} />
      <div className="editor-actions">
        <button type="button" className="primary compact" onClick={() => onSave(draft)} disabled={busy || draft === selection.value}>{busy ? 'Saving…' : 'Save'}</button>
        {override && <button type="button" className="secondary compact" onClick={onRevert} disabled={busy}>Revert to generated</button>}
      </div>
    </> : identity && <p className="builder-empty">This element resolves, but the template declares no editable property for it yet. Component, asset and design edits arrive with the later Phase 4B stages.</p>}
  </section>;
}



/**
 * How a selected section reads.
 *
 * Only the presentations its template genuinely renders are offered. A
 * component with one presentation is not listed at all, because a choice of one
 * is not a choice, and nothing here mutates the DOM: the choice is recorded and
 * the section is recomposed.
 */
function SectionVariantPanel({ option, onChoose, busy }: {
  option: SectionVariantOption;
  onChoose: (sectionId: string, variant: string | null) => Promise<void>;
  busy: boolean;
}) {
  return <section className="builder-panel variant-panel" aria-label="Section presentation">
    <div className="panel-title-row"><span className="builder-kicker">Presentation</span><span>{option.componentId}</span></div>
    <p className="editor-target">{option.sectionId.replace(/^page-/, '').replaceAll('-', ' ')}</p>
    <div className="variant-options">{option.variants.map((variant) => <button
      type="button"
      key={variant.id}
      className={option.variant === variant.id ? 'variant-option active' : 'variant-option'}
      onClick={() => onChoose(option.sectionId, variant.id)}
      disabled={busy || option.variant === variant.id}
    >
      <strong>{variant.label}</strong>
      <span>{variant.purpose}</span>
    </button>)}</div>
    {option.chosen && <button type="button" className="secondary compact" onClick={() => onChoose(option.sectionId, null)} disabled={busy}>
      Back to {option.composedVariant}, as composed
    </button>}
  </section>;
}


/**
 * Design Contract.
 *
 * Structured controls over the decisions the factory already makes, not a
 * stylesheet. Every control offers a declared set of values, and the accent is
 * refused when it cannot carry the label placed on it at a readable contrast —
 * which is a correctness rule, not a matter of taste.
 */
function DesignPanel({ contract, onChoose, busy }: {
  contract: DesignContract;
  onChoose: (choices: Record<string, string | null>) => Promise<void>;
  busy: boolean;
}) {
  const [accent, setAccent] = useState(contract.design.accentColor);
  useEffect(() => { setAccent(contract.design.accentColor); }, [contract.design.accentColor]);

  return <section className="builder-panel design-panel" aria-label="Design contract">
    <div className="panel-title-row"><span className="builder-kicker">Design</span><span>{contract.design.label}</span></div>

    <label className="design-accent">
      <span>Accent</span>
      <input type="color" aria-label="Brand accent colour" value={accent} onChange={(event) => setAccent(event.target.value)} disabled={busy} />
      <code>{accent}</code>
      <button type="button" className="secondary compact" onClick={() => onChoose({ accentColor: accent })} disabled={busy || accent === contract.design.accentColor}>Apply</button>
    </label>
    <p className="builder-empty">An accent that cannot carry its own label at {contract.accentContrastMinimum}:1 is refused.</p>

    {contract.controls.map((control) => <div className="design-control" key={control.control}>
      <span className="design-control-label">{control.label}</span>
      <div className="design-options">{control.options.map((option) => <button
        type="button"
        key={option.id}
        title={option.purpose}
        className={control.value === option.id ? 'design-option active' : 'design-option'}
        onClick={() => onChoose({ [control.control]: option.id })}
        disabled={busy || control.value === option.id}
      >{option.label}</button>)}</div>
    </div>)}

    {Object.keys(contract.chosen).length > 0 && <button type="button" className="secondary compact" onClick={() => onChoose(Object.fromEntries(Object.keys(contract.chosen).map((key) => [key, null])))} disabled={busy}>
      Back to the factory's design
    </button>}
  </section>;
}


/** The one readiness ladder, in order. Position is the only ordering there is. */
const LADDER = [
  'contract-approved',
  'materialized',
  'buildable',
  'behavior-verified',
  'quality-accepted',
  'release-candidate',
  'released',
  'production-verified',
] as const;

/**
 * Where this exact artifact stands, and what it is not.
 *
 * The Console showed `state` — `ready`, `generated`, `verified` — and nothing
 * else, and those are the legacy build-progress words the architecture is
 * explicit are not a readiness verdict. An operator reading `verified` had no
 * way to learn that it means a build once exited zero, not that anything is fit
 * to publish. The claim the factory actually makes lives on the revision, and
 * it was reaching the browser and being dropped.
 *
 * `notMeaning` is rendered as prominently as the position, because every one of
 * those sentences is a claim somebody would otherwise make from the state name.
 * Both come from the service, so there is one authority for what a state means.
 */
function ReadinessLadderPanel({ project }: { project: ProjectSummary }) {
  const { lifecycle } = project;
  const reached = lifecycle.lifecycleState ? LADDER.indexOf(lifecycle.lifecycleState as (typeof LADDER)[number]) : -1;

  return <section className="builder-panel ladder-panel" aria-label="Readiness ladder">
    <div className="panel-title-row">
      <span className="builder-kicker">This artifact</span>
      <span className={reached >= 0 ? 'rights-pill publishable' : 'rights-pill'}>{lifecycle.lifecycleState ?? 'no revision'}</span>
    </div>
    <ol className="ladder-list">{LADDER.map((state, index) => <li
      key={state}
      className={index < reached ? 'ladder-step earned' : index === reached ? 'ladder-step current' : 'ladder-step'}
    >{state}</li>)}</ol>
    <p className="builder-empty">{lifecycle.basis}</p>
    {lifecycle.notMeaning && <p className="ladder-not-meaning"><strong>Not</strong> {lifecycle.notMeaning}</p>}
    {lifecycle.missing.length > 0 && <p className="builder-empty">To go one rung further this artifact would have to record {lifecycle.missing.join(', ')}.</p>}
    {/* `state` stays visible because the rest of the workspace is driven by it,
        and because hiding it would not make it stop being what the buttons
        respond to. It is labelled as what it is. */}
    <small className="ladder-legacy">Build progress: {project.state}. That is where the workspace is, not what the artifact has earned.</small>
  </section>;
}

/**
 * What this build needs next.
 *
 * "Improve this page" is the prompt most likely to produce a redesign nobody
 * asked for. Every opportunity here is grouped from launch-readiness findings
 * that already exist, so the answer is what the build actually needs, and each
 * one names the role that owns the fix — an opportunity nobody owns is a
 * complaint.
 *
 * Proving something and fixing something are kept apart. A state with no
 * fixture is a gap in the factory's evidence, not an edit a person makes.
 */
function ProductReviewPanel({ review }: { review: ProductReview }) {
  const states = review.stateMatrix.flatMap((surface) => surface.states.map((state) => ({ ...state, page: surface.page })));
  const highRisk = states.filter((state) => state.risk === 'high');
  const provenStates = highRisk.filter((state) => state.evidence !== 'none').length;
  const steps = review.journeys.flatMap((journey) => journey.steps);
  const provenSteps = steps.filter((step) => step.status === 'proven').length;

  return <section className="builder-panel review-panel" aria-label="Product review">
    <div className="panel-title-row">
      <span className="builder-kicker">What this build needs</span>
      <span className={review.launchable ? 'rights-pill publishable' : 'rights-pill'}>{review.launchable ? 'no blocking findings' : `${review.summary.blocker} blocking`}</span>
    </div>
    <p className="builder-empty">{review.predictedManualEdits} edit{review.predictedManualEdits === 1 ? '' : 's'} predicted before a person would call this finished.</p>
    {review.launchable && <p className="builder-empty">That is what the deterministic checks can see, not a readiness verdict. Rendered evidence, an independent review and a release approval are separate things this build has not been given.</p>}

    {review.opportunities.length === 0
      ? <p className="builder-empty">Nothing the deterministic checks can name. Rendered evidence and a human review are what judge it from here.</p>
      : <div className="opportunity-list">{review.opportunities.map((opportunity) => <article className="opportunity" key={opportunity.id}>
          <div className="opportunity-heading">
            <strong>{opportunity.title}</strong>
            <span className={opportunity.blockedOn === 'owner' ? 'rights-pill' : 'rights-pill publishable'}>{opportunity.blockedOn === 'owner' ? 'needs your material' : 'factory can act'}</span>
          </div>
          <ul>{opportunity.summary.map((line) => <li key={line}>{line}</li>)}</ul>
          <span className="opportunity-meta">{opportunity.findingCount} finding{opportunity.findingCount === 1 ? '' : 's'} · {opportunity.where.slice(0, 3).join(', ')}{opportunity.where.length > 3 ? ` +${opportunity.where.length - 3}` : ''}</span>
          <small>{opportunity.guidance}</small>
        </article>)}</div>}
    {review.consideredCount > review.opportunities.length && <p className="builder-empty">
      {review.consideredCount - review.opportunities.length} further opportunit{review.consideredCount - review.opportunities.length === 1 ? 'y was' : 'ies were'} considered and not offered, to keep this to the three that matter most.
    </p>}

    <dl className="builder-definition review-evidence">
      <div><dt>High-risk states</dt><dd>{provenStates}/{highRisk.length} with evidence</dd></div>
      <div><dt>Journey steps</dt><dd>{provenSteps}/{steps.length} proven</dd></div>
    </dl>
    {review.evidenceOpportunities.length > 0 && <div className="evidence-uncovered">
      <strong>Worth proving, not fixing</strong>
      {review.evidenceOpportunities.map((entry) => <span key={entry.id}>{entry.title} — {entry.findingCount} gap{entry.findingCount === 1 ? '' : 's'}</span>)}
    </div>}
  </section>;
}

function dimensions(asset: ProjectAsset) {
  if (!asset.width || !asset.height) return 'dimensions unknown';
  return `${asset.width}×${asset.height}${asset.lowResolution ? ' · low resolution' : ''}`;
}

/**
 * Asset manager.
 *
 * Approving a source is not approving every asset derived from it, so each
 * image carries its own decision. What it inherited from its source and what a
 * person decided are shown separately: an asset nobody has looked at must not
 * read as one that was approved.
 */
/**
 * Choosing where the subject is.
 *
 * Sharp's attention heuristic decides the crop when nobody has said. Clicking
 * the picture says, and the three crops are recomputed around that point. It
 * does not publish them: agreeing with the result is a separate judgement.
 */
function FocalPointPicker({ projectId, asset, onPick, busy }: {
  projectId: string;
  asset: ProjectAsset;
  onPick: (assetId: string, focalPoint: { x: number; y: number }) => Promise<void>;
  busy: boolean;
}) {
  const point = asset.focalPoint ?? { x: 0.5, y: 0.5 };
  return <div className="focal-picker">
    <button
      type="button"
      className="focal-target"
      aria-label={`Set the focal point for ${asset.sourceLabel ?? asset.id}`}
      disabled={busy}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        if (!box.width || !box.height) return;
        onPick(asset.id, {
          x: Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1),
          y: Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1),
        });
      }}
    >
      <img src={assetPreviewUrl(projectId, asset.id)} alt="" />
      <span className="focal-marker" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />
    </button>
    <span className="asset-meta">
      {asset.focalPoint ? `Focal point ${Math.round(point.x * 100)}% / ${Math.round(point.y * 100)}%` : 'Crops chosen by the attention heuristic — click to say where the subject is.'}
    </span>
  </div>;
}

function AssetPanel({ projectId, assets, onDecide, onPickFocalPoint, onReplace, busyAssetId, disabled }: {
  projectId: string;
  assets: ProjectAsset[];
  onDecide: (assetId: string, decision: AssetDecisionRequest) => Promise<void>;
  onPickFocalPoint: (assetId: string, focalPoint: { x: number; y: number }) => Promise<void>;
  onReplace: (assetId: string, file: File, rightsDeclarationRequired: boolean) => Promise<void>;
  busyAssetId: string | null;
  disabled: boolean;
}) {
  const publishable = assets.filter((asset) => asset.publishUseAllowed).length;
  const undecided = assets.filter((asset) => !asset.decision && !asset.duplicateOf).length;

  return <section className="builder-panel asset-panel" aria-label="Assets and publication rights">
    <div className="panel-title-row"><span className="builder-kicker">Assets</span><span>{publishable}/{assets.length} publishable</span></div>
    {assets.length === 0
      ? <p className="builder-empty">Ingest company images to decide what may be published.</p>
      : <>
        <p className="builder-empty">
          A public page can be read without its photographs becoming republishable. Each image is decided on its own.
          {undecided > 0 ? ` ${undecided} still undecided.` : ''}
        </p>
        <div className="asset-list">{assets.map((asset) => {
          const busy = busyAssetId === asset.id;
          const blocked = disabled || busy || Boolean(asset.duplicateOf);
          return <article className="asset-item" key={asset.id}>
            <div className="asset-heading">
              <strong>{asset.sourceLabel ?? asset.id}</strong>
              <span className={asset.publishUseAllowed ? 'rights-pill publishable' : 'rights-pill'}>{label(asset.assetStatus)}</span>
            </div>
            <span className="asset-meta">{label(asset.kind)} · {label(asset.provenance)} · {label(asset.sourceChannel)}</span>
            <span className="asset-meta">{dimensions(asset)} · {asset.variantCount} variant{asset.variantCount === 1 ? '' : 's'}</span>
            {asset.duplicateOf && <span className="asset-note">Exact duplicate of another asset — decide that one instead.</span>}
            {asset.visualDuplicateOf && !asset.duplicateOf && <span className="asset-note">Looks like another ingested image.</span>}
            <span className="asset-meta">
              Inherited: {label(asset.inherited.rightsStatus)} · {asset.decision ? `decided ${label(asset.decision.decision)}` : 'no decision yet'}
            </span>
            {asset.cropCount > 0 && <span className="asset-meta">
              {asset.cropCount} generated crop{asset.cropCount === 1 ? '' : 's'} · {asset.cropReview === 'approved' ? 'approved, will publish' : 'withheld until reviewed'}
            </span>}
            {asset.recroppable && !asset.duplicateOf && <FocalPointPicker projectId={projectId} asset={asset} onPick={onPickFocalPoint} busy={blocked} />}
            {asset.supersededBy && <span className="asset-note">Replaced by a newer picture.</span>}
            {asset.replaces && <span className="asset-meta">Replaced an earlier picture.</span>}
            {!asset.duplicateOf && !asset.supersededBy && <label className="asset-replace">
              <span>Replace this picture</span>
              <input
                type="file"
                accept="image/*"
                aria-label={`Replace ${asset.sourceLabel ?? asset.id}`}
                disabled={blocked}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onReplace(asset.id, file, asset.rightsDeclarationRequired);
                }}
              />
            </label>}
            {!asset.duplicateOf && <div className="asset-actions">
              <button type="button" onClick={() => onDecide(asset.id, { decision: 'approve', rightsDeclaration: asset.rightsDeclarationRequired ? 'owned-by-the-business' : null, cropReview: asset.cropReview === 'approved' ? 'approved' : 'pending' })} disabled={blocked}>
                {asset.rightsDeclarationRequired ? 'Approve — we own this' : 'Approve'}
              </button>
              {asset.cropCount > 0 && asset.publishUseAllowed && <button type="button" onClick={() => onDecide(asset.id, { decision: 'approve', rightsDeclaration: asset.decision?.rightsDeclaration as AssetDecisionRequest['rightsDeclaration'], cropReview: asset.cropReview === 'approved' ? 'pending' : 'approved' })} disabled={blocked}>
                {asset.cropReview === 'approved' ? 'Withhold crops' : 'Approve crops'}
              </button>}
              <button type="button" onClick={() => onDecide(asset.id, { decision: 'reject' })} disabled={blocked}>Reject</button>
              <button type="button" onClick={() => onDecide(asset.id, { decision: 'do-not-use' })} disabled={blocked}>Do not use</button>
              {asset.decision && <button type="button" onClick={() => onDecide(asset.id, { decision: 'clear' })} disabled={blocked}>Clear</button>}
            </div>}
          </article>;
        })}</div>
      </>}
  </section>;
}

const UNCOVERED_REASON: Record<string, string> = {
  'not-visually-provable': 'a picture cannot show this',
  'needs-a-deterministic-fixture': 'needs a fixture build',
  'capability-not-installed': 'not present in this build',
};

/**
 * Visual candidate comparison — Phase 4D.
 *
 * The ordinary Console, deliberately, rather than an infinite canvas. What a
 * comparison actually needs is: the candidates side by side at a chosen width,
 * the differences named rather than left to be spotted, what the deterministic
 * checks already settled, the questions a rule deliberately does not answer,
 * and a way to promote exactly one. All of that is a two-column grid and a
 * viewport switch. A canvas is adopted only when this proves it cannot do the
 * job, and it has not.
 *
 * It renders in the builder stage rather than the activity sidebar. That is not
 * a cosmetic preference: two full-page captures cropped into a 330px column are
 * not a comparison, and the surface that could not do the job was the narrow
 * one, not the ordinary one. The stage is the width the Console already has.
 *
 * The differences are computed and shown rather than implied. "These two look
 * different" is what a reviewer should be checking, not deducing.
 */
const AXIS_LABELS: Record<string, string> = {
  heroStrategy: 'Opening',
  gridFamily: 'Grid',
  headingTreatment: 'Headings',
  ctaPlacement: 'Closing action',
  distinctiveMoment: 'Distinctive moment',
  layoutVariance: 'Ground changes',
  visualDistinctiveness: 'Opening scale',
  motionIntensity: 'Motion',
  informationDensity: 'Rhythm',
};

/**
 * The responsive plan, field by field, rather than the signature's packed form.
 *
 * `responsiveStrategy` exists so two candidates can be compared for equality
 * cheaply, and `copy-first/disclosure/conversion-first/tighter/as-desktop` is
 * the right shape for that and the wrong shape for a person. The reviewer is
 * asked whether the mobile rendering is a designed composition rather than the
 * desktop one with fewer columns, so the composition is what gets shown.
 */
const RESPONSIVE_LABELS: Record<string, string> = {
  mobileHero: 'Opening on a phone',
  navigation: 'Navigation',
  mobileSectionOrder: 'Section order on a phone',
  mobileDensity: 'Density',
  mobileMotion: 'Motion',
};

const GATE_LABELS: Record<string, string> = {
  blocked: 'Blocked by a rule',
  'review-required': 'Needs your judgement on a warning',
  clear: 'Deterministic checks clear',
  'not-run': 'Not yet checked',
};

const SEVERITY_LABELS: Record<string, string> = {
  violation: 'Blocks promotion',
  warning: 'You must speak to this',
  recommendation: 'Take it or leave it',
};

/** Which axes actually differ across the set, so the table shows differences rather than a dump. */
function differingAxes(candidates: VisualCandidate[]) {
  return Object.keys(AXIS_LABELS).filter((axis) => new Set(candidates.map((candidate) => String(candidate.signature.axes[axis] ?? ''))).size > 1);
}

/** The same, for the responsive plan the template actually reads. */
function differingResponsive(candidates: VisualCandidate[]) {
  return Object.keys(RESPONSIVE_LABELS).filter((field) => new Set(candidates.map((candidate) => String(candidate.artDirection?.responsive?.[field] ?? ''))).size > 1);
}

/**
 * The criteria the packets scope this set to.
 *
 * They are derived per candidate but from set-level facts — project type and
 * whether anything publishable is being photographed — so they are shown once.
 * A union rather than the first packet's list, because silently dropping a
 * question one candidate carries would narrow the review without saying so.
 */
function scopedCriteria(packets: Record<string, VisualReviewPacket>) {
  const seen = new Map<string, string>();
  for (const packet of Object.values(packets)) for (const criterion of packet.criteria) seen.set(criterion.id, criterion.question);
  return [...seen].map(([id, question]) => ({ id, question }));
}

function VisualCandidatePanel({ projectId, set, summary, activeDirectionId, onAdopt, onChanged, onError }: {
  projectId: string;
  set: VisualCandidateSet | null;
  summary: VisualCandidateSetSummary | null;
  activeDirectionId: string | null;
  onAdopt: (directionId: string) => Promise<void>;
  onChanged: (next: VisualCandidateSet) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [viewport, setViewport] = useState('desktop');
  const [route, setRoute] = useState('/');
  const [evidence, setEvidence] = useState<Record<string, RenderedEvidence>>({});
  const [packets, setPackets] = useState<Record<string, VisualReviewPacket>>({});
  const [reviewer, setReviewer] = useState('');
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const [interaction, setInteraction] = useState('viewport');
  const [criterionScores, setCriterionScores] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = (set?.candidates ?? []).map((candidate) => candidate.evidenceId).filter((id): id is string => Boolean(id));
    if (!ids.length) return undefined;
    listRenderedEvidence(projectId).then((all) => {
      if (cancelled) return;
      setEvidence(Object.fromEntries(all.filter((entry) => ids.includes(entry.id)).map((entry) => [entry.id, entry])));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, set]);

  // The packet carries the two things the set itself does not: what the
  // direction was trying to do, and the questions a rule deliberately does not
  // answer. Without them the panel shows a reviewer two pictures and no brief.
  useEffect(() => {
    let cancelled = false;
    const candidateIds = (set?.candidates ?? []).map((candidate) => candidate.candidateId);
    if (!candidateIds.length) return undefined;
    Promise.all(candidateIds.map((candidateId) => readVisualReviewPacket(projectId, candidateId).then(
      (packet) => [candidateId, packet] as const,
      () => null,
    ))).then((entries) => {
      if (cancelled) return;
      setPackets(Object.fromEntries(entries.filter((entry): entry is readonly [string, VisualReviewPacket] => Boolean(entry))));
    });
    return () => { cancelled = true; };
  }, [projectId, set]);

  async function act(key: string, work: () => Promise<VisualCandidateSet>) {
    setBusy(key);
    onError('');
    try {
      onChanged(await work());
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  const candidates = set?.candidates ?? [];
  const axes = differingAxes(candidates);
  const responsiveFields = differingResponsive(candidates);
  const criteria = scopedCriteria(packets);
  const routes = [...new Set(Object.values(evidence).flatMap((entry) => entry.captures.map((capture) => capture.route)))];
  // Every interaction state that was captured on this route, not only the
  // resting one. The nbm review photographed a failed enquiry on both
  // candidates and the switcher could not reach either picture, which made an
  // evidence set that covered the state read as one that did not.
  const states = [
    { id: 'viewport', label: 'at rest' },
    ...[...new Set(Object.values(evidence).flatMap((entry) => entry.captures
      .filter((capture) => capture.route === route && capture.state.interaction)
      .map((capture) => capture.state.interaction as string)))].map((interaction) => ({ id: interaction, label: label(interaction) })),
  ];
  const activeState = states.some((entry) => entry.id === interaction) ? interaction : 'viewport';
  const captureFor = (candidate: VisualCandidate) => {
    const entry = candidate.evidenceId ? evidence[candidate.evidenceId] : null;
    return entry?.captures.find((capture) => capture.route === route
      && capture.viewport === viewport
      && (activeState === 'viewport' ? capture.state.axis === 'viewport' : capture.state.interaction === activeState)) ?? null;
  };
  const detailFor = (candidate: VisualCandidate, rule: string) => candidate.designLint?.findings.find((finding) => finding.rule === rule)?.detail ?? null;

  // A verdict now carries a number against every criterion it was scoped. The
  // bar is 8.5 for a reason nobody here invented: it is the programme target in
  // the pipeline gate registry, and it travels with the packet so a reviewer can
  // see what a 7 means before they type one.
  const scoresFor = (candidateId: string) => criterionScores[candidateId] ?? {};
  const criteriaFor = (candidateId: string) => packets[candidateId]?.criteria ?? criteria;
  const scoredEverything = (candidateId: string) => criteriaFor(candidateId).every((criterion) => Number.isFinite(scoresFor(candidateId)[criterion.id]));
  const failingFor = (candidateId: string) => criteriaFor(candidateId)
    .filter((criterion) => (scoresFor(candidateId)[criterion.id] ?? 10) < (summary?.minimumScore ?? 8.5))
    .map((criterion) => criterion.id);
  const overallFor = (candidateId: string) => {
    const values = criteriaFor(candidateId).map((criterion) => scoresFor(candidateId)[criterion.id]).filter((value): value is number => Number.isFinite(value));
    return values.length ? Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)) : null;
  };
  // A person reviewing through the Console is independent of whatever produced
  // the candidate, but independence is decided on `vendor`, so the person has to
  // be expressible in the same terms as a runtime. `human` is the vendor; the
  // name they typed is what distinguishes one person from another.
  const asPerson = (role: string) => ({ role, vendor: 'human', model: reviewer.trim() });

  const reviewPayload = (candidate: VisualCandidate, verdict: string) => ({
    verdict,
    reviewedBy: asPerson('design-critic'),
    addressedRules: candidate.gate.mustAddress,
    rationale: rationale[candidate.candidateId] ?? '',
    criterionScores: criteriaFor(candidate.candidateId).map((criterion) => ({ criterion: criterion.id, score: scoresFor(candidate.candidateId)[criterion.id] })),
    failingCriteria: verdict === 'pass' ? [] : failingFor(candidate.candidateId),
  });

  return <section className="builder-panel candidate-panel" aria-label="Visual directions">
    <div className="panel-title-row">
      <span className="builder-kicker">Visual directions</span>
      <span>{set ? `${candidates.length} candidates${set.promotedCandidateId ? ' · decided' : ''}` : 'none yet'}</span>
    </div>
    <p className="builder-empty">Several genuinely different presentations of the same facts. They say the same thing; they are not the same site.</p>

    {!set && <button type="button" className="secondary compact" disabled={busy !== null} onClick={() => act('generate', () => generateVisualCandidates(projectId, FACTORY_AUTHOR))}>
      {busy === 'generate' ? 'Generating…' : 'Generate candidates'}
    </button>}

    {set && <>
      <dl className="builder-definition">
        <div><dt>Imagery</dt><dd>{set.assetReadiness.strategyReason}</dd></div>
        <div><dt>Distinct</dt><dd>{set.diversity.distinct ? `Differ in at least ${set.diversity.minimumDifferingPlanes} of sequence, composition and responsive behaviour` : 'Not distinct'}</dd></div>
      </dl>

      {/* What every candidate shares. A comparison is only a comparison while
          the two things being compared say the same thing, so the reviewer is
          shown the truth they share rather than asked to assume it. */}
      <details className="candidate-truth">
        <summary>What every candidate shares</summary>
        <dl className="builder-definition candidate-provenance">
          <div><dt>Set</dt><dd><code>{set.setId}</code></dd></div>
          <div><dt>Created</dt><dd>{new Date(set.createdAt).toLocaleString()}</dd></div>
          <div><dt>Project type</dt><dd>{label(set.frozenTruth.projectType)}</dd></div>
          <div><dt>Manifest</dt><dd>v{set.frozenTruth.manifestVersion}</dd></div>
          <div><dt>Knowledge pack</dt><dd><code>{set.frozenTruth.knowledgePackHash ?? 'none attached'}</code></dd></div>
          <div><dt>Baseline composition</dt><dd><code>{set.frozenTruth.baselineCompositionHash}</code></dd></div>
        </dl>
        <p className="builder-empty">Facts, routes, capabilities, claims and provenance are frozen across the set. A candidate that regenerated any of them is not a visual candidate.</p>
      </details>

      {set.refusedDirections.length > 0 && <div className="evidence-uncovered">
        <strong>{set.refusedDirections.length} direction(s) this project cannot present by</strong>
        {set.refusedDirections.map((entry) => <span key={entry.directionId}>{entry.directionId} — {entry.detail}</span>)}
      </div>}

      {!candidates.some((candidate) => candidate.evidenceId) && <button type="button" className="secondary compact" disabled={busy !== null} onClick={() => act('capture', () => captureVisualCandidateEvidence(projectId))}>
        {busy === 'capture' ? 'Building and capturing…' : 'Build and capture every candidate'}
      </button>}

      {routes.length > 0 && <div className="candidate-controls">
        <div className="device-switcher" role="group" aria-label="Comparison viewport">
          {['desktop', 'tablet', 'mobile'].map((name) => <button type="button" key={name} className={viewport === name ? 'active' : ''} onClick={() => setViewport(name)}>{name}</button>)}
        </div>
        <div className="device-switcher" role="group" aria-label="Comparison route">
          {routes.map((name) => <button type="button" key={name} className={route === name ? 'active' : ''} onClick={() => setRoute(name)}>{name}</button>)}
        </div>
        {states.length > 1 && <div className="device-switcher" role="group" aria-label="Comparison state">
          {states.map((entry) => <button type="button" key={entry.id} className={activeState === entry.id ? 'active' : ''} onClick={() => setInteraction(entry.id)}>{entry.label}</button>)}
        </div>}
      </div>}

      <div className="candidate-grid">{candidates.map((candidate) => {
        const capture = captureFor(candidate);
        const packet = packets[candidate.candidateId] ?? null;
        const findings = candidate.designLint?.findings ?? [];
        return <article key={candidate.candidateId} className={`candidate-card outcome-${candidate.outcome}`}>
          <header>
            <strong>{candidate.directionLabel}</strong>
            <span className={`candidate-gate gate-${candidate.gate.status}`}>{GATE_LABELS[candidate.gate.status] ?? candidate.gate.status}</span>
          </header>
          <p className="candidate-id"><code>{candidate.candidateId}</code> · {label(candidate.assetStrategy)}</p>
          {packet?.purpose && <p className="candidate-purpose">{packet.purpose}</p>}
          {capture && candidate.evidenceId
            ? <div
              className="candidate-shot"
              // A full-page capture is taller than the card, so the card scrolls
              // it. A scroll region a keyboard cannot reach is content a keyboard
              // user cannot read, which on a review surface means half the
              // evidence.
              tabIndex={0}
              role="group"
              aria-label={`${candidate.directionLabel} at ${route}, ${viewport}, ${activeState === 'viewport' ? 'at rest' : label(activeState)} — scrollable full-page capture`}
            >
              <img src={renderedCaptureUrl(projectId, candidate.evidenceId, capture.id)} alt={`${candidate.directionLabel} at ${route}, ${viewport}, ${activeState === 'viewport' ? 'at rest' : label(activeState)}`} loading="lazy" />
            </div>
            : <p className="builder-empty">No capture yet at this route, width and state.</p>}
          {axes.length > 0 && <dl className="builder-definition candidate-axes">
            {axes.map((axis) => <div key={axis}><dt>{AXIS_LABELS[axis]}</dt><dd>{label(String(candidate.signature.axes[axis] ?? '—'))}</dd></div>)}
          </dl>}
          {responsiveFields.length > 0 && <dl className="builder-definition candidate-axes candidate-responsive">
            {responsiveFields.map((field) => <div key={field}><dt>{RESPONSIVE_LABELS[field]}</dt><dd>{label(String(candidate.artDirection?.responsive?.[field] ?? '—'))}</dd></div>)}
          </dl>}
          {candidate.gate.blocking.length > 0 && <div className="evidence-uncovered">
            <strong>Cannot be promoted</strong>
            {candidate.gate.blocking.map((entry) => <span key={entry.rule}>{entry.detail}</span>)}
          </div>}
          {candidate.gate.mustAddress.length > 0 && <div className="evidence-uncovered">
            <strong>Say what you think about {candidate.gate.mustAddress.length === 1 ? 'this' : 'these'}</strong>
            {candidate.gate.mustAddress.map((rule) => <span key={rule}>{label(rule)}{detailFor(candidate, rule) ? ` — ${detailFor(candidate, rule)}` : ''}</span>)}
          </div>}
          {/* Everything DesignLint settled, at every severity. A recommendation
              never blocks anything, and a reviewer who cannot see it cannot
              decide to ignore it on purpose. */}
          <div className="candidate-lint">
            <strong>DesignLint</strong>
            {findings.length === 0
              ? <span>No violation, warning or recommendation on this candidate.</span>
              : findings.map((finding) => <span key={`${finding.rule}-${finding.detail}`}><em>{SEVERITY_LABELS[finding.severity] ?? finding.severity}</em> {label(finding.rule)} — {finding.detail}</span>)}
          </div>
          {candidate.lineage && <div className="candidate-lineage">
            <strong>Revision {candidate.lineage.iteration} of {candidate.lineage.parentCandidateId}</strong>
            <span>Failed: {candidate.lineage.failingCriteria.map(label).join(', ')}</span>
            {candidate.lineage.requestedChanges.map((change) => <span key={change.axis}>{label(change.axis)}: {label(change.from)} → {label(change.to)} — {change.because}</span>)}
            <span>Same product truth: <code>{candidate.lineage.frozenTruthHash}</code></span>
          </div>}
          {candidate.review && <p className="builder-empty">
            {label(candidate.review.verdict)} by {who(candidate.review.reviewedBy)}
            {typeof candidate.review.overallScore === 'number' ? ` · ${candidate.review.overallScore}/10` : ''}
            {candidate.review.thresholdMet === false ? ` · ${candidate.review.thresholdDetail ?? 'below the bar'}` : ''}
            {candidate.review.rationale ? ` — ${candidate.review.rationale}` : ''}
          </p>}
          {!set.promotedCandidateId && candidate.gate.status !== 'blocked' && candidate.gate.status !== 'not-run' && <div className="candidate-actions">
            <textarea
              rows={2}
              aria-label={`Why — ${candidate.directionLabel}`}
              placeholder="Why. A verdict with no reason is not a review."
              value={rationale[candidate.candidateId] ?? ''}
              onChange={(event) => setRationale((current) => ({ ...current, [candidate.candidateId]: event.target.value }))}
            />
            {!candidate.review && <>
              {/* Every criterion gets a number. A verdict with no score cannot
                  be a pass, because the bar has to have something to read. */}
              <div className="candidate-scores">
                {criteriaFor(candidate.candidateId).map((criterion) => <label key={criterion.id}>
                  <span>{label(criterion.id)}</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    inputMode="decimal"
                    aria-label={`${label(criterion.id)} — ${candidate.directionLabel}, out of 10`}
                    value={scoresFor(candidate.candidateId)[criterion.id] ?? ''}
                    onChange={(event) => {
                      const value = event.target.value === '' ? Number.NaN : Number(event.target.value);
                      setCriterionScores((current) => ({
                        ...current,
                        [candidate.candidateId]: { ...current[candidate.candidateId], [criterion.id]: value },
                      }));
                    }}
                  />
                </label>)}
                <p className="builder-empty">
                  {overallFor(candidate.candidateId) === null
                    ? `Score every criterion out of 10. ${summary?.minimumScore ?? 8.5} or better is the professional bar; below it, the answer is rework or reject.`
                    : `Overall ${overallFor(candidate.candidateId)} against a ${summary?.minimumScore ?? 8.5} bar.`}
                </p>
              </div>
              <button type="button" className="secondary compact" disabled={busy !== null || !reviewer.trim() || !(rationale[candidate.candidateId] ?? '').trim() || !scoredEverything(candidate.candidateId)} onClick={() => act(`pass-${candidate.candidateId}`, () => recordVisualReview(projectId, candidate.candidateId, reviewPayload(candidate, 'pass')))}>Pass</button>
              <button type="button" className="secondary compact" disabled={busy !== null || !reviewer.trim() || !(rationale[candidate.candidateId] ?? '').trim() || !scoredEverything(candidate.candidateId)} onClick={() => act(`rework-${candidate.candidateId}`, () => recordVisualReview(projectId, candidate.candidateId, reviewPayload(candidate, 'rework')))}>Rework</button>
              <button type="button" className="secondary compact" disabled={busy !== null || !reviewer.trim() || !(rationale[candidate.candidateId] ?? '').trim() || !scoredEverything(candidate.candidateId)} onClick={() => act(`reject-${candidate.candidateId}`, () => recordVisualReview(projectId, candidate.candidateId, reviewPayload(candidate, 'reject')))}>Reject</button>
            </>}
            {candidate.review?.verdict === 'rework' && !summary?.exhausted && <button type="button" className="secondary compact" disabled={busy !== null || !reviewer.trim()} onClick={() => act(`revise-${candidate.candidateId}`, async () => (await reworkVisualCandidate(projectId, candidate.candidateId, reviewer.trim())).set)}>
              {busy === `revise-${candidate.candidateId}` ? 'Revising…' : `Make the revision (pass ${(candidate.iteration ?? 0) + 1} of ${summary?.budget ?? 2})`}
            </button>}
            {candidate.review?.verdict === 'pass' && <button type="button" disabled={busy !== null || !reviewer.trim()} onClick={() => act(`promote-${candidate.candidateId}`, () => promoteVisualCandidate(projectId, candidate.candidateId, { promotedBy: asPerson('design-critic'), rationale: rationale[candidate.candidateId] ?? '' }))}>
              {busy === `promote-${candidate.candidateId}` ? 'Promoting…' : 'Promote this one'}
            </button>}
          </div>}

          {/* Working with a direction is not accepting it.
            *
            * Promotion is a reviewed decision: a named person, a rationale, and
            * a score against every criterion. It records that somebody judged
            * this design, and that rule is right and is not relaxed here.
            *
            * But an owner building their own site is not conducting an
            * acceptance review, and the two used to be the same door. They could
            * generate three directions and compare them, and then had no way to
            * carry on with one: the only route to seeing a chosen direction in
            * their own preview was to file a verdict they had not made. So the
            * ordinary path writes the ordinary thing — a design choice, the same
            * kind the density and radius controls write — with no claim attached
            * about anybody having judged it.
            */}
          <div className="candidate-adopt">
            {activeDirectionId === candidate.directionId
              ? <p><strong>In use.</strong> Your site is built this way.</p>
              : <>
                <button type="button" className="secondary compact" disabled={busy !== null} onClick={() => act(`adopt-${candidate.directionId}`, async () => { await onAdopt(candidate.directionId); return set; })}>
                  {busy === `adopt-${candidate.directionId}` ? 'Switching…' : 'Build my site this way'}
                </button>
                <small>A working choice, not an acceptance. Rebuild to see it.</small>
              </>}
          </div>
        </article>;
      })}</div>

      {/* The questions, once, because they are scoped from set-level facts. Each
          one needs judgement; none of them can be settled by reading the
          compiled design, which is the test a criterion has to pass to be
          here at all. */}
      {criteria.length > 0 && <div className="candidate-criteria">
        <strong>What only judgement can settle</strong>
        <ol>{criteria.map((criterion) => <li key={criterion.id}><span>{label(criterion.id)}</span>{criterion.question}</li>)}</ol>
      </div>}

      {/* The two outcomes that are not a winner. A review that can only promote
          ends up promoting the least bad candidate, so this is deliberately as
          reachable as promotion is. */}
      {summary && summary.setOutcome === 'undecided' && (summary.canRework || summary.canReject) && <div className="candidate-set-decision">
        <strong>None of these is good enough</strong>
        <p className="builder-empty">
          Every candidate has been judged and none cleared the {summary.minimumScore ?? 8.5} bar. Send the set back for one bounded pass, or close it with nothing promoted.
          {summary.exhausted ? ' The rework budget is spent, so rejecting is the remaining answer.' : ` ${summary.remaining} of ${summary.budget} rework pass(es) left.`}
        </p>
        <div className="candidate-actions">
          {summary.canRework && !summary.exhausted && <button type="button" className="secondary compact" disabled={busy !== null || !reviewer.trim()} onClick={() => act('set-rework', () => decideVisualCandidateSet(projectId, { outcome: 'rework-required', decidedBy: asPerson('design-critic'), rationale: rationale.set ?? '' }))}>Send the set back for rework</button>}
          {summary.canReject && <button type="button" className="secondary compact" disabled={busy !== null || !reviewer.trim()} onClick={() => act('set-reject', () => decideVisualCandidateSet(projectId, { outcome: 'rejected', decidedBy: asPerson('design-critic'), rationale: rationale.set ?? '' }))}>Reject all of them</button>}
        </div>
      </div>}

      {set.decision && set.setOutcome !== 'promoted' && <div className="evidence-uncovered">
        <strong>Set {label(set.setOutcome ?? 'decided')} by {who(set.decision.decidedBy)}</strong>
        {set.decision.rationale && <span>{set.decision.rationale}</span>}
      </div>}

      {(set.reworkPlans ?? []).filter((plan) => plan.customPresentation).map((plan) => <div key={plan.planId} className="evidence-uncovered">
        <strong>A presentation the registry does not have</strong>
        <span>{plan.customPresentation?.artDirectionNeed}</span>
        <span>{plan.customPresentation?.registryInsufficientBecause}</span>
        <span>Owner: {plan.customPresentation?.owner} · {plan.customPresentation?.sectionId}</span>
      </div>)}

      {!set.promotedCandidateId && <label className="candidate-reviewer">
        <span>Who is deciding</span>
        <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Your name or role" />
        <small>The factory created these, so the factory cannot promote one. A decision needs someone to have made it.</small>
      </label>}
      {set.promotedCandidateId && <p className="builder-empty">
        Promoted {candidates.find((candidate) => candidate.candidateId === set.promotedCandidateId)?.directionLabel}. The next build renders it; the candidate workspaces are gone and their evidence is kept.
      </p>}
    </>}
  </section>;
}

/**
 * Rendered evidence.
 *
 * Shows what the build actually rendered, and — just as importantly — what
 * these pictures are not evidence of. A screenshot set that only showed the
 * captures would read as complete coverage of states it never reached.
 */
function EvidencePanel({ projectId, evidence, onCapture, busy, canCapture }: {
  projectId: string;
  evidence: RenderedEvidence[];
  onCapture: () => Promise<void>;
  busy: boolean;
  canCapture: boolean;
}) {
  const latest = evidence.at(-1) ?? null;
  const [viewport, setViewport] = useState<string>('desktop');
  const shown = latest?.captures.filter((capture) => capture.viewport === viewport) ?? [];

  return <section className="builder-panel evidence-panel" aria-label="Rendered evidence">
    <div className="panel-title-row"><span className="builder-kicker">Rendered evidence</span><span>{latest ? `${latest.captures.length} captures` : 'none yet'}</span></div>
    <p className="builder-empty">A build that compiles is not evidence that it looks right. These are captures of what it actually rendered.</p>
    <button type="button" className="secondary compact" onClick={onCapture} disabled={busy || !canCapture}>
      {busy ? 'Capturing…' : latest ? 'Capture again' : 'Capture evidence'}
    </button>
    {!canCapture && !busy && <p className="builder-empty">Start the preview first — evidence is captured from the same rendering you review.</p>}

    {latest && <>
      <div className="device-switcher evidence-viewports" role="group" aria-label="Evidence viewport">
        {latest.viewports.map((entry) => <button type="button" key={entry.name} className={viewport === entry.name ? 'active' : ''} onClick={() => setViewport(entry.name)}>{entry.name}</button>)}
      </div>
      <div className="evidence-grid">{shown.map((capture) => <figure key={capture.id}>
        <img src={renderedCaptureUrl(projectId, latest.id, capture.id)} alt={`${capture.route} at ${capture.viewport}: ${capture.state.proves}`} loading="lazy" />
        <figcaption><strong>{capture.route}</strong><span>{label(capture.state.axis)} · {label(capture.state.state)}</span><small>{capture.state.proves}</small></figcaption>
      </figure>)}</div>
      {latest.uncovered.length > 0 && <div className="evidence-uncovered">
        <strong>{latest.uncovered.length} state(s) these captures do not claim</strong>
        {latest.uncovered.slice(0, 8).map((entry) => <span key={`${entry.route}-${entry.axis}-${entry.state}`}>{entry.route} · {label(entry.axis)} {label(entry.state)} — {UNCOVERED_REASON[entry.reason] ?? entry.reason}</span>)}
      </div>}
    </>}
  </section>;
}

export function BuilderWorkspace({ projectId, onExit }: { projectId: string; onExit: () => void }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  // The stage shows one thing at a time: the running preview, or the candidate
  // comparison. Both want the wide column, and neither is useful in a 330px one.
  const [stageView, setStageView] = useState<StageView>('preview');
  const [operation, setOperation] = useState<Operation>(null);
  const [sourceOperation, setSourceOperation] = useState<string | null>(null);
  const [assetOperation, setAssetOperation] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resolution, setResolution] = useState<ElementResolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [choosingVariant, setChoosingVariant] = useState(false);
  const [choosingDesign, setChoosingDesign] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);

  const refresh = useCallback(async () => {
    const next = await loadWorkspace(projectId);
    setSnapshot(next);
    return next;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    loadWorkspace(projectId).then((next) => { if (active) setSnapshot(next); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!operation) return;
    const timer = window.setInterval(() => { refresh().catch(() => undefined); }, 1000);
    return () => window.clearInterval(timer);
  }, [operation, refresh]);

  const applyProjectState = useCallback((project: ProjectSummary | null) => {
    if (!project) return;
    setSnapshot((current) => current ? { ...current, project } : current);
  }, []);

  const run = useCallback(async (nextOperation: Exclude<Operation, null>) => {
    setOperation(nextOperation);
    setError('');
    try {
      let updatedProject: ProjectSummary | null = null;
      if (nextOperation === 'generate') updatedProject = await generateProject(projectId);
      if (nextOperation === 'verify') updatedProject = await verifyProject(projectId);
      if (nextOperation === 'start-preview') await startPreview(projectId);
      if (nextOperation === 'stop-preview') await stopPreview(projectId);
      if (nextOperation === 'capture-evidence') await captureRenderedEvidence(projectId);

      // Mutation responses are the authoritative state transition. Apply them
      // immediately so a secondary read cannot hide a successful operation;
      // the full refresh then fills composition/events/metrics/checkpoint data.
      applyProjectState(updatedProject);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await refresh().catch(() => undefined);
    } finally {
      setOperation(null);
    }
  }, [applyProjectState, projectId, refresh]);

  const ingest = useCallback(async (sources: SourceRequest[]) => {
    setOperation('ingest');
    setError('');
    try {
      await ingestSources(projectId, sources);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOperation(null);
    }
  }, [projectId, refresh]);

  // The preview runs the generated app in an iframe and reports what was
  // clicked. It is a different origin in principle, so messages are matched on
  // their declared source rather than trusted wholesale.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.source !== 'app-builder-preview' || data.type !== 'element-selected') return;
      if (typeof data.pageId !== 'string' || typeof data.sectionId !== 'string' || typeof data.elementKey !== 'string') return;
      setSelection({
        pageId: data.pageId,
        sectionId: data.sectionId,
        elementKey: data.elementKey,
        bindingKey: typeof data.bindingKey === 'string' ? data.bindingKey : null,
        origin: String(data.origin ?? 'unknown'),
        value: String(data.value ?? ''),
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Identity is resolved by the service against the index the build recorded.
  // The preview reported coordinates; nothing about component, provenance,
  // tokens or file location is taken from the frame's word for it.
  useEffect(() => {
    if (!selection) { setResolution(null); return; }
    let active = true;
    setResolving(true);
    resolveElement(projectId, { pageId: selection.pageId, sectionId: selection.sectionId, elementKey: selection.elementKey })
      .then((next) => { if (active) setResolution(next); })
      .catch(() => { if (active) setResolution({ status: 'unknown', ref: null, identity: null, projectId }); })
      .finally(() => { if (active) setResolving(false); });
    return () => { active = false; };
  }, [projectId, selection]);

  const writeOverrides = useCallback(async (next: ContentOverride[]) => {
    setSavingEdit(true);
    setError('');
    try {
      await saveOverrides(projectId, next);
      await refresh();
      // Vite serves the generated app and watches its composition module, so a
      // saved edit reaches the preview without a rebuild. The nonce forces the
      // frame to pick it up even when hot reload is unavailable.
      setPreviewNonce((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingEdit(false);
    }
  }, [projectId, refresh]);

  const overrides = snapshot?.overrides ?? [];
  // A selection resolves to the section it sits in, so choosing how that
  // section reads is offered wherever anything inside it is selected.
  const selectedVariantOption = selection
    ? snapshot?.sectionVariants.find((entry) => entry.sectionId === selection.sectionId) ?? null
    : null;
  const activeOverride = selection?.bindingKey
    ? overrides.find((entry) => entry.sectionId === selection.sectionId && entry.bindingKey === selection.bindingKey) ?? null
    : null;

  const saveEdit = useCallback(async (value: string) => {
    if (!selection?.bindingKey) return;
    const bindingKey = selection.bindingKey;
    const others = overrides.filter((entry) => !(entry.sectionId === selection.sectionId && entry.bindingKey === bindingKey));
    await writeOverrides([...others, { sectionId: selection.sectionId, bindingKey, value, editedAt: new Date().toISOString() }]);
    setSelection({ ...selection, value, origin: 'human' });
  }, [overrides, selection, writeOverrides]);

  const revertEdit = useCallback(async () => {
    if (!selection?.bindingKey) return;
    const bindingKey = selection.bindingKey;
    await writeOverrides(overrides.filter((entry) => !(entry.sectionId === selection.sectionId && entry.bindingKey === bindingKey)));
    setSelection(null);
  }, [overrides, selection, writeOverrides]);

  const runAssetChange = useCallback(async (assetId: string, change: () => Promise<unknown>) => {
    setAssetOperation(assetId);
    setError('');
    try {
      await change();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await refresh().catch(() => undefined);
    } finally {
      setAssetOperation(null);
    }
  }, [refresh]);

  const decideAsset = useCallback(
    (assetId: string, decision: AssetDecisionRequest) => runAssetChange(assetId, () => decideProjectAsset(projectId, assetId, decision)),
    [projectId, runAssetChange],
  );

  const replaceAsset = useCallback(
    (assetId: string, file: File, rightsDeclarationRequired: boolean) => runAssetChange(assetId, async () => {
      const source = await fileToSourceRequest(file, false, 'replacement image');
      // A replacement is a different photograph, so the declaration is made now
      // rather than carried over from the picture it replaces.
      return replaceProjectAsset(projectId, assetId, source, rightsDeclarationRequired ? 'owned-by-the-business' : null);
    }),
    [projectId, runAssetChange],
  );

  const pickFocalPoint = useCallback(
    (assetId: string, focalPoint: { x: number; y: number }) => runAssetChange(assetId, () => setAssetFocalPoint(projectId, assetId, focalPoint)),
    [projectId, runAssetChange],
  );

  const chooseVariant = useCallback(async (sectionId: string, variant: string | null) => {
    setChoosingVariant(true);
    setError('');
    try {
      await chooseSectionVariant(projectId, sectionId, variant);
      await refresh();
      // The preview renders the workspace composition, so a recomposed section
      // reaches it without a rebuild.
      setPreviewNonce((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await refresh().catch(() => undefined);
    } finally {
      setChoosingVariant(false);
    }
  }, [projectId, refresh]);

  const chooseDesign = useCallback(async (choices: Record<string, string | null>) => {
    setChoosingDesign(true);
    setError('');
    try {
      await updateDesignContract(projectId, choices);
      await refresh();
      // The brand stylesheet is generated, so a compiled design reaches the
      // preview without a rebuild.
      setPreviewNonce((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await refresh().catch(() => undefined);
    } finally {
      setChoosingDesign(false);
    }
  }, [projectId, refresh]);

  const decideSource = useCallback(async (sourceId: string, decision: SourceGovernanceDecision) => {
    setSourceOperation(sourceId);
    setError('');
    try {
      await updateSourceGovernance(projectId, sourceId, decision);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await refresh().catch(() => undefined);
    } finally {
      setSourceOperation(null);
    }
  }, [projectId, refresh]);

  const latestTask = snapshot?.tasks.at(-1) ?? null;
  // Ingested material only reaches the product through a build, so a knowledge
  // pack newer than the live composition is a call to rebuild, not a warning.
  const builtKnowledgeHash = snapshot?.composition?.input?.knowledgePackHash ?? null;
  const builtDecisionsHash = snapshot?.composition?.input?.assetDecisionsHash ?? null;
  const built = Boolean(snapshot?.project.workspacePath);
  // The revision the live repository is at, so the result panel can name the
  // exact state an operator is being handed rather than just a directory.
  const latestCheckpoint = snapshot?.checkpoints?.length ? snapshot.checkpoints[snapshot.checkpoints.length - 1] : null;
  const knowledgeIsNewerThanBuild = built && (snapshot?.project.knowledgePackHash ?? null) !== builtKnowledgeHash;
  // An asset decision changes what the build would publish, so it makes the
  // live repository stale in exactly the way new source material does.
  const decisionsAreNewerThanBuild = built && (snapshot?.assetDecisionsHash ?? null) !== builtDecisionsHash;
  const buildIsBehind = knowledgeIsNewerThanBuild || decisionsAreNewerThanBuild;
  const canGenerate = snapshot ? snapshot.project.state !== 'generating' : false;
  const rebuild = Boolean(snapshot?.project.workspacePath);
  const canVerify = snapshot?.project.state === 'generated';
  const canPreview = snapshot?.project.state === 'verified' && snapshot.preview.state === 'stopped';
  const previewStarting = snapshot?.preview.state === 'starting';
  const previewRunning = snapshot?.preview.state === 'running' && Boolean(snapshot.preview.path);
  const pages = snapshot?.composition?.pages ?? [];
  const warnings = snapshot?.composition?.warnings ?? [];
  const integrationsConfigured = useMemo(() => snapshot?.integrations.filter((item) => item.configured).length ?? 0, [snapshot]);

  if (!snapshot) return <main className="builder-loading"><div className="builder-spinner" /><p>{error || 'Loading real factory state…'}</p><button type="button" className="secondary" onClick={onExit}>Back</button></main>;

  const sourceGovernanceEditable = snapshot.project.state === 'ready' && !snapshot.project.knowledgePackHash;

  return <main className="builder-shell">
    <header className="builder-topbar">
      <button type="button" className="builder-brand" onClick={onExit}><span className="brand-mark">A</span><span>App Builder</span></button>
      <div className="builder-project-meta"><span className={`state-pill state-${snapshot.project.state}`}>{snapshot.project.state}</span><strong>{snapshot.project.name}</strong><span>{snapshot.project.type.replaceAll('-', ' ')}</span></div>
      <div className="builder-actions">
        <button type="button" className="secondary compact" onClick={() => refresh()} disabled={Boolean(operation) || Boolean(sourceOperation)}>Refresh</button>
        {canGenerate && <button type="button" className={buildIsBehind || !rebuild ? 'primary compact' : 'secondary compact'} onClick={() => run('generate')} disabled={Boolean(operation) || Boolean(sourceOperation)}>{operation === 'generate' ? (rebuild ? 'Rebuilding…' : 'Generating…') : (rebuild ? 'Rebuild project' : 'Generate project')}</button>}
        {canVerify && <button type="button" className="primary compact" onClick={() => run('verify')} disabled={Boolean(operation)}>{operation === 'verify' ? 'Verifying…' : 'Verify build'}</button>}
        {canPreview && <button type="button" className="primary compact" onClick={() => run('start-preview')} disabled={Boolean(operation)}>{operation === 'start-preview' ? 'Starting…' : 'Start preview'}</button>}
        {previewRunning && <button type="button" className="secondary compact" onClick={() => run('stop-preview')} disabled={Boolean(operation)}>{operation === 'stop-preview' ? 'Stopping…' : 'Stop preview'}</button>}
      </div>
    </header>

    {error && <div className="builder-alert" role="alert"><strong>Factory operation failed</strong><span>{error}</span></div>}

    {buildIsBehind && !error && <div className="builder-notice">
      <strong>{knowledgeIsNewerThanBuild ? 'Source material has changed since the last build.' : 'Asset decisions have changed since the last build.'}</strong>
      <span>Rebuild the project so {knowledgeIsNewerThanBuild ? 'the new knowledge' : 'the new decisions'} reach the generated repository. The current build stays on disk.</span>
    </div>}

    {/* Comparing gives the stage the whole width. Two full-page captures
        beside each other is the job; the build sidebars are context for
        building, and the comparison panel already carries what a reviewer
        needs. One click back to preview restores them. */}
    <section className={stageView === 'compare' ? 'builder-layout comparing' : 'builder-layout'}>
      <aside className="builder-sidebar">
        <section className="builder-panel project-panel">
          <span className="builder-kicker">Project</span>
          <h1>{snapshot.project.name}</h1>
          <p>{snapshot.project.slug}</p>
          <dl className="builder-definition"><div><dt>Manifest</dt><dd>v{snapshot.project.manifestVersion}</dd></div><div><dt>Knowledge</dt><dd>{snapshot.project.knowledgePackHash ? 'attached' : 'manifest only'}</dd></div><div><dt>Workspace</dt><dd>{snapshot.project.workspacePath ? 'materialised' : 'not generated'}</dd></div></dl>
        </section>

        {/*
          Where the website actually is.
          A generated project is an ordinary repository, and until this panel
          existed the Console never said where it had put one. "Workspace:
          materialised" tells an operator that something happened somewhere.
          Finding it meant reading the service log or knowing the directory
          layout, which is the kind of knowledge this product exists to remove.
        */}
        {snapshot.project.workspacePath && <section className="builder-panel result-panel" aria-label="Generated repository">
          <span className="builder-kicker">Your website</span>
          <p className="builder-empty">An ordinary repository. Copy it anywhere, <code>npm ci &amp;&amp; npm run dev</code>, and it runs the exact dependency graph it was verified against, with no dependency on this factory.</p>
          <dl className="builder-definition">
            <div><dt>Repository</dt><dd><code className="result-path">{snapshot.project.workspacePath}</code></dd></div>
            <div><dt>Build</dt><dd>{snapshot.project.state === 'verified' ? 'installs, checks and builds on its own' : snapshot.project.state === 'generated' ? 'generated — not verified yet' : snapshot.project.state}</dd></div>
            {latestCheckpoint && <div><dt>Revision</dt><dd><code className="result-path">{latestCheckpoint.id}</code></dd></div>}
          </dl>
          <button type="button" className="secondary compact" onClick={() => navigator.clipboard?.writeText(snapshot.project.workspacePath ?? '')}>Copy path</button>
        </section>}

        <section className="builder-panel source-governance-panel" aria-label="Source and asset rights">
          <div className="panel-title-row"><span className="builder-kicker">Sources & rights</span><span>{snapshot.sources.length}</span></div>
          <p className="source-governance-copy">Observed brand material can guide the build without granting republication rights. Approve only source files you are entitled to use.</p>
          {snapshot.sources.length ? <div className="source-governance-list">{snapshot.sources.map((source) => {
            const publicReference = source.kind === 'url' || /^https?:/i.test(source.uri ?? '');
            const canApprove = sourceGovernanceEditable && source.provenance === 'user-supplied' && !publicReference;
            const busy = sourceOperation === source.id;
            return <article className="source-governance-item" key={source.id}>
              <div className="source-governance-heading"><strong>{source.label}</strong><span className={`rights-pill rights-${source.rightsStatus ?? 'unknown'}`}>{label(source.rightsStatus ?? 'unknown')}</span></div>
              <span className="source-governance-meta">{label(source.kind)} · {label(source.sourceChannel ?? (publicReference ? 'website' : 'upload'))}</span>
              {source.purpose && <small>{source.purpose}</small>}
              <div className="source-governance-state"><span>{label(source.assetStatus ?? 'suggested')}</span><strong>{source.publishUseAllowed ? 'Publishable' : 'Reference / blocked'}</strong></div>
              {sourceGovernanceEditable ? <div className="source-governance-actions">
                {canApprove && <button type="button" onClick={() => decideSource(source.id, 'approve-for-use')} disabled={busy || Boolean(operation)}>Approve use</button>}
                <button type="button" onClick={() => decideSource(source.id, 'reference-only')} disabled={busy || Boolean(operation)}>Reference only</button>
                <button type="button" onClick={() => decideSource(source.id, 'do-not-use')} disabled={busy || Boolean(operation)}>Do not use</button>
              </div> : <small className="source-lock-note">Rights are locked after knowledge ingestion or generation so durable source truth cannot diverge.</small>}
            </article>;
          })}</div> : <p className="builder-empty">No source references were recorded in the approved intake.</p>}
        </section>

        <section className="builder-panel metric-grid" aria-label="Project metrics">
          <div><span>Cost</span><strong>£{snapshot.metrics.costGbp.toFixed(2)}</strong></div>
          <div><span>Events</span><strong>{snapshot.metrics.eventCount}</strong></div>
          <div><span>Runtime</span><strong>{duration(snapshot.metrics.durationMs)}</strong></div>
          <div><span>Interventions</span><strong>{snapshot.metrics.interventions}</strong></div>
        </section>

        <SourcePanel
          knowledge={snapshot.knowledge}
          declaredSources={snapshot.sources}
          disabled={snapshot.project.state === 'generating'}
          busy={operation === 'ingest'}
          onIngest={ingest}
        />

        <ReadinessLadderPanel project={snapshot.project} />

        {snapshot.review && <ProductReviewPanel review={snapshot.review} />}

        {snapshot.design && <DesignPanel contract={snapshot.design} onChoose={chooseDesign} busy={choosingDesign} />}

        {snapshot.designReferences && <DesignReferencePanel
          projectId={projectId}
          state={snapshot.designReferences}
          disabled={snapshot.project.state === 'generating'}
          onChanged={(state: DesignReferenceState) => setSnapshot((current) => (current ? { ...current, designReferences: state } : current))}
          onError={setError}
        />}

        <AssetPanel
          projectId={projectId}
          assets={snapshot.assets}
          onDecide={decideAsset}
          onPickFocalPoint={pickFocalPoint}
          onReplace={replaceAsset}
          busyAssetId={assetOperation}
          disabled={snapshot.project.state === 'generating'}
        />

        <section className="builder-panel">
          <div className="panel-title-row"><span className="builder-kicker">Build plan</span><span>{pages.length} routes</span></div>
          {pages.length ? <nav className="route-list">{pages.map((page) => <div key={page.id}><strong>{page.title}</strong><span>{page.path}</span><small>{page.sectionIds.length} sections</small></div>)}</nav> : <p className="builder-empty">Generate the project to materialise its page/section plan.</p>}
          {warnings.length > 0 && <div className="warning-list">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
        </section>

        <section className="builder-panel">
          <div className="panel-title-row"><span className="builder-kicker">Connections</span><span>{integrationsConfigured}/{snapshot.integrations.length}</span></div>
          <div className="integration-list">{snapshot.integrations.map((integration) => <div key={integration.id}><span className={integration.configured ? 'connection-dot connected' : 'connection-dot'} /><strong>{integration.id}</strong><span>{integration.configured ? 'configured' : 'not configured'}</span></div>)}</div>
        </section>
      </aside>

      <section className="builder-stage">
        <div className="preview-toolbar">
          <div><span className="builder-kicker">{stageView === 'compare' ? 'Visual directions' : 'Live preview'}</span><strong>{stageView === 'compare'
            ? snapshot.visualCandidates ? `${snapshot.visualCandidates.candidates.length} candidates over one frozen truth` : 'No candidate set yet'
            : previewRunning ? snapshot.preview.path : previewStarting ? 'Starting…' : 'Service-managed preview'}</strong></div>
          <div className="stage-controls">
            <div className="device-switcher" role="group" aria-label="Builder stage">
              <button type="button" className={stageView === 'preview' ? 'active' : ''} onClick={() => setStageView('preview')}>preview</button>
              <button type="button" className={stageView === 'compare' ? 'active' : ''} onClick={() => setStageView('compare')}>compare</button>
            </div>
            {stageView === 'preview' && <div className="device-switcher" role="group" aria-label="Preview device">{(['desktop', 'tablet', 'mobile'] as Device[]).map((value) => <button type="button" key={value} className={device === value ? 'active' : ''} onClick={() => setDevice(value)}>{value}</button>)}</div>}
          </div>
        </div>
        {stageView === 'compare'
          ? <div className="stage-compare"><VisualCandidatePanel
            projectId={projectId}
            set={snapshot.visualCandidates}
            summary={snapshot.visualCandidateSummary}
            activeDirectionId={snapshot.design?.design.visualDirectionId ?? null}
            onAdopt={(directionId) => chooseDesign({ visualDirection: directionId })}
            onChanged={(next) => setSnapshot((current) => (current ? { ...current, visualCandidates: next } : current))}
            onError={setError}
          /></div>
          : <div className={`preview-canvas preview-${device}`}>
            {previewRunning ? <iframe key={previewNonce} title={`${snapshot.project.name} preview`} src={`${snapshot.preview.path}?__builder=1`} style={{ width: `${deviceWidth[device]}px` }} /> : <div className="preview-empty"><div className="preview-glyph">↗</div><h2>{previewStarting ? 'Starting the preview…' : snapshot.project.state === 'ready' ? 'Generate the product foundation.' : snapshot.project.state === 'generated' ? 'Verify the standalone build.' : 'Start the local preview.'}</h2><p>The preview process belongs to the factory service. Desktop, tablet and mobile frames all use the same generated repository.</p></div>}
          </div>}
      </section>

      <aside className="activity-sidebar">
        {selection && <ElementInspector
          selection={selection}
          resolution={resolution}
          resolving={resolving}
          override={activeOverride}
          onSave={saveEdit}
          onRevert={revertEdit}
          onClose={() => setSelection(null)}
          busy={savingEdit}
        />}

        {selectedVariantOption && <SectionVariantPanel option={selectedVariantOption} onChoose={chooseVariant} busy={choosingVariant} />}

        {previewRunning && !selection && <section className="builder-panel">
          <span className="builder-kicker">Editing</span>
          <p className="builder-empty">Click anything in the preview to resolve its element identity; headings and paragraphs can be edited from there. {overrides.length > 0 ? `${overrides.length} edit${overrides.length === 1 ? '' : 's'} saved.` : 'Edits are kept and replayed over every rebuild.'}</p>
        </section>}

        <EvidencePanel
          projectId={projectId}
          evidence={snapshot.evidence}
          onCapture={() => run('capture-evidence')}
          busy={operation === 'capture-evidence'}
          canCapture={previewRunning}
        />

        <section className="builder-panel checkpoint-panel">
          <span className="builder-kicker">Latest checkpoint</span>
          {snapshot.checkpoint ? <><strong>{snapshot.checkpoint.summary}</strong><p>{snapshot.checkpoint.nextAction}</p><small>{new Date(snapshot.checkpoint.createdAt).toLocaleString()}</small></> : <p className="builder-empty">No durable checkpoint yet.</p>}
        </section>

        <section className="builder-panel">
          <div className="panel-title-row"><span className="builder-kicker">History</span><span>{snapshot.checkpoints.length}</span></div>
          {snapshot.checkpoints.length ? <div className="history-list">{snapshot.checkpoints.slice().reverse().map((checkpoint) => <article key={checkpoint.id} className={checkpoint.repoRef === snapshot.project.workspacePath ? 'current' : undefined}>
            <strong>{checkpoint.summary}</strong>
            <time>{new Date(checkpoint.createdAt).toLocaleString()}</time>
            {checkpoint.repoRef === snapshot.project.workspacePath && <span>live build</span>}
          </article>)}</div> : <p className="builder-empty">Checkpoints appear as durable work completes.</p>}
        </section>

        <section className="builder-panel">
          <div className="panel-title-row"><span className="builder-kicker">Tasks</span><span>{snapshot.tasks.length}</span></div>
          <div className="task-list">{snapshot.tasks.length ? snapshot.tasks.slice().reverse().map((task) => <article key={task.id}><span className={`task-state task-${task.state}`} /> <div><strong>{task.objective}</strong><span>{task.state}{task.attempt ? ` · attempt ${task.attempt}` : ''}</span>{task.stopReason && <small>{task.stopReason}</small>}</div></article>) : <p className="builder-empty">No tasks have run yet.</p>}</div>
          {latestTask?.state === 'running' && <div className="live-operation"><span /><strong>Factory is working</strong></div>}
        </section>

        <section className="builder-panel activity-panel">
          <div className="panel-title-row"><span className="builder-kicker">Event ledger</span><span>{snapshot.events.length}</span></div>
          <div className="event-list">{snapshot.events.length ? snapshot.events.slice().reverse().map((event) => <article key={event.id}><div className="event-line"><span className={`event-dot ${event.type.endsWith('.failed') ? 'failed' : event.type.endsWith('.succeeded') || event.type.includes('generated') || event.type.includes('materialised') || event.type === 'source.governance.updated' ? 'passed' : ''}`} /><strong>{label(event.type)}</strong></div><p>{eventSummary(event)}</p><time>{new Date(event.timestamp).toLocaleTimeString()}</time></article>) : <p className="builder-empty">Factory events will appear here as real work happens.</p>}</div>
        </section>
      </aside>
    </section>
  </main>;
}
