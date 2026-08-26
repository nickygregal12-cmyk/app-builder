import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assetPreviewUrl,
  captureRenderedEvidence,
  chooseSectionVariant,
  decideProjectAsset,
  generateProject,
  ingestSources,
  loadWorkspace,
  renderedCaptureUrl,
  resolveElement,
  saveOverrides,
  setAssetFocalPoint,
  startPreview,
  stopPreview,
  updateSourceGovernance,
  verifyProject,
  type ContentOverride,
  type ElementResolution,
  type AssetDecisionRequest,
  type KnowledgeSummary,
  type ProjectAsset,
  type ProjectSummary,
  type RenderedEvidence,
  type SectionVariantOption,
  type SourceGovernanceDecision,
  type SourceReference,
  type SourceRequest,
  type WorkspaceSnapshot,
} from '../service/client';
import './workspace.css';

type Device = 'desktop' | 'tablet' | 'mobile';
type Operation = 'generate' | 'verify' | 'start-preview' | 'stop-preview' | 'ingest' | 'capture-evidence' | null;

const deviceWidth: Record<Device, number> = { desktop: 1280, tablet: 768, mobile: 390 };

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
  if (event.type === 'sources.ingested') return `${String((payload.added as unknown[] | undefined)?.length ?? 0)} source(s) · ${String(payload.factCount ?? 0)} facts · ${String(payload.assetCount ?? 0)} assets`;
  if (event.type === 'sources.ingestion.started') return `Normalising ${String(payload.requested ?? 0)} source(s)`;
  if (event.type === 'composition.materialised') return `${String(payload.pages ?? 0)} pages · ${String(payload.sections ?? 0)} sections`;
  if (event.type === 'repository.generated') return 'Standalone repository materialised';
  if (event.type === 'quality.install.succeeded') return `Dependencies installed · ${duration(event.usage.durationMs)}`;
  if (event.type === 'quality.check.succeeded') return `Checks passed · ${duration(event.usage.durationMs)}`;
  if (event.type === 'quality.build.succeeded') return `Production build passed · ${duration(event.usage.durationMs)}`;
  if (event.type === 'source.governance.updated') return `${String(payload.sourceId ?? 'Source')} · ${label(String(payload.decision ?? 'updated'))}`;
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

function AssetPanel({ projectId, assets, onDecide, onPickFocalPoint, busyAssetId, disabled }: {
  projectId: string;
  assets: ProjectAsset[];
  onDecide: (assetId: string, decision: AssetDecisionRequest) => Promise<void>;
  onPickFocalPoint: (assetId: string, focalPoint: { x: number; y: number }) => Promise<void>;
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
  const [operation, setOperation] = useState<Operation>(null);
  const [sourceOperation, setSourceOperation] = useState<string | null>(null);
  const [assetOperation, setAssetOperation] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resolution, setResolution] = useState<ElementResolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [choosingVariant, setChoosingVariant] = useState(false);
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
  const knowledgeIsNewerThanBuild = built && (snapshot?.project.knowledgePackHash ?? null) !== builtKnowledgeHash;
  // An asset decision changes what the build would publish, so it makes the
  // live repository stale in exactly the way new source material does.
  const decisionsAreNewerThanBuild = built && (snapshot?.assetDecisionsHash ?? null) !== builtDecisionsHash;
  const buildIsBehind = knowledgeIsNewerThanBuild || decisionsAreNewerThanBuild;
  const canGenerate = snapshot ? snapshot.project.state !== 'generating' : false;
  const rebuild = Boolean(snapshot?.project.workspacePath);
  const canVerify = snapshot?.project.state === 'generated';
  const canPreview = snapshot?.project.state === 'verified' && snapshot.preview.state === 'stopped';
  const previewRunning = snapshot?.preview.state === 'running' && Boolean(snapshot.preview.url);
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

    <section className="builder-layout">
      <aside className="builder-sidebar">
        <section className="builder-panel project-panel">
          <span className="builder-kicker">Project</span>
          <h1>{snapshot.project.name}</h1>
          <p>{snapshot.project.slug}</p>
          <dl className="builder-definition"><div><dt>Manifest</dt><dd>v{snapshot.project.manifestVersion}</dd></div><div><dt>Knowledge</dt><dd>{snapshot.project.knowledgePackHash ? 'attached' : 'manifest only'}</dd></div><div><dt>Workspace</dt><dd>{snapshot.project.workspacePath ? 'materialised' : 'not generated'}</dd></div></dl>
        </section>

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

        <AssetPanel
          projectId={projectId}
          assets={snapshot.assets}
          onDecide={decideAsset}
          onPickFocalPoint={pickFocalPoint}
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
          <div><span className="builder-kicker">Live preview</span><strong>{previewRunning ? snapshot.preview.url : 'Service-managed preview'}</strong></div>
          <div className="device-switcher" role="group" aria-label="Preview device">{(['desktop', 'tablet', 'mobile'] as Device[]).map((value) => <button type="button" key={value} className={device === value ? 'active' : ''} onClick={() => setDevice(value)}>{value}</button>)}</div>
        </div>
        <div className={`preview-canvas preview-${device}`}>
          {previewRunning ? <iframe key={previewNonce} title={`${snapshot.project.name} preview`} src={`${snapshot.preview.url}?__builder=1`} style={{ width: `${deviceWidth[device]}px` }} /> : <div className="preview-empty"><div className="preview-glyph">↗</div><h2>{snapshot.project.state === 'ready' ? 'Generate the product foundation.' : snapshot.project.state === 'generated' ? 'Verify the standalone build.' : 'Start the local preview.'}</h2><p>The preview process belongs to the factory service. Desktop, tablet and mobile frames all use the same generated repository.</p></div>}
        </div>
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
