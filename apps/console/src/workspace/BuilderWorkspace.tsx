import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateProject,
  ingestSources,
  loadWorkspace,
  saveOverrides,
  startPreview,
  stopPreview,
  verifyProject,
  type ContentOverride,
  type DeclaredSource,
  type KnowledgeSummary,
  type ProjectSummary,
  type SourceRequest,
  type WorkspaceSnapshot,
} from '../service/client';
import './workspace.css';

type Device = 'desktop' | 'tablet' | 'mobile';
type Operation = 'generate' | 'verify' | 'start-preview' | 'stop-preview' | 'ingest' | null;

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
  declaredSources: DeclaredSource[];
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

type Selection = { sectionId: string; bindingKey: string; origin: string; value: string };

const ORIGIN_LABEL: Record<string, string> = {
  'knowledge-fact': 'from a source you supplied',
  'knowledge-entity': 'from a source you supplied',
  manifest: 'from your Build Contract',
  'deterministic-default': 'written by the factory',
  human: 'edited by you',
};

function ContentEditor({ selection, override, onSave, onRevert, onClose, busy }: {
  selection: Selection;
  override: ContentOverride | null;
  onSave: (value: string) => Promise<void>;
  onRevert: () => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(selection.value);
  useEffect(() => { setDraft(selection.value); }, [selection.sectionId, selection.bindingKey, selection.value]);

  return <section className="builder-panel editor-panel">
    <div className="panel-title-row"><span className="builder-kicker">Edit content</span><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    <p className="editor-target">{selection.sectionId.replace(/^page-/, '').replaceAll('-', ' ')} · {selection.bindingKey}</p>
    <p className="editor-provenance">{ORIGIN_LABEL[selection.origin] ?? selection.origin}</p>
    <textarea aria-label="Content value" rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} />
    <div className="editor-actions">
      <button type="button" className="primary compact" onClick={() => onSave(draft)} disabled={busy || draft === selection.value}>{busy ? 'Saving…' : 'Save'}</button>
      {override && <button type="button" className="secondary compact" onClick={onRevert} disabled={busy}>Revert to generated</button>}
    </div>
  </section>;
}

export function BuilderWorkspace({ projectId, onExit }: { projectId: string; onExit: () => void }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [operation, setOperation] = useState<Operation>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
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
      if (!data || data.source !== 'app-builder-preview' || data.type !== 'binding-selected') return;
      if (typeof data.sectionId !== 'string' || typeof data.bindingKey !== 'string') return;
      setSelection({ sectionId: data.sectionId, bindingKey: data.bindingKey, origin: String(data.origin ?? 'unknown'), value: String(data.value ?? '') });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
  const activeOverride = selection
    ? overrides.find((entry) => entry.sectionId === selection.sectionId && entry.bindingKey === selection.bindingKey) ?? null
    : null;

  const saveEdit = useCallback(async (value: string) => {
    if (!selection) return;
    const others = overrides.filter((entry) => !(entry.sectionId === selection.sectionId && entry.bindingKey === selection.bindingKey));
    await writeOverrides([...others, { sectionId: selection.sectionId, bindingKey: selection.bindingKey, value, editedAt: new Date().toISOString() }]);
    setSelection({ ...selection, value, origin: 'human' });
  }, [overrides, selection, writeOverrides]);

  const revertEdit = useCallback(async () => {
    if (!selection) return;
    await writeOverrides(overrides.filter((entry) => !(entry.sectionId === selection.sectionId && entry.bindingKey === selection.bindingKey)));
    setSelection(null);
  }, [overrides, selection, writeOverrides]);

  const latestTask = snapshot?.tasks.at(-1) ?? null;
  // Ingested material only reaches the product through a build, so a knowledge
  // pack newer than the live composition is a call to rebuild, not a warning.
  const builtKnowledgeHash = snapshot?.composition?.input?.knowledgePackHash ?? null;
  const knowledgeIsNewerThanBuild = Boolean(snapshot?.project.workspacePath) && (snapshot?.project.knowledgePackHash ?? null) !== builtKnowledgeHash;
  const canGenerate = snapshot ? snapshot.project.state !== 'generating' : false;
  const rebuild = Boolean(snapshot?.project.workspacePath);
  const canVerify = snapshot?.project.state === 'generated';
  const canPreview = snapshot?.project.state === 'verified' && snapshot.preview.state === 'stopped';
  const previewRunning = snapshot?.preview.state === 'running' && Boolean(snapshot.preview.url);
  const pages = snapshot?.composition?.pages ?? [];
  const warnings = snapshot?.composition?.warnings ?? [];
  const integrationsConfigured = useMemo(() => snapshot?.integrations.filter((item) => item.configured).length ?? 0, [snapshot]);

  if (!snapshot) return <main className="builder-loading"><div className="builder-spinner" /><p>{error || 'Loading real factory state…'}</p><button type="button" className="secondary" onClick={onExit}>Back</button></main>;

  return <main className="builder-shell">
    <header className="builder-topbar">
      <button type="button" className="builder-brand" onClick={onExit}><span className="brand-mark">A</span><span>App Builder</span></button>
      <div className="builder-project-meta"><span className={`state-pill state-${snapshot.project.state}`}>{snapshot.project.state}</span><strong>{snapshot.project.name}</strong><span>{snapshot.project.type.replaceAll('-', ' ')}</span></div>
      <div className="builder-actions">
        <button type="button" className="secondary compact" onClick={() => refresh()} disabled={Boolean(operation)}>Refresh</button>
        {canGenerate && <button type="button" className={knowledgeIsNewerThanBuild || !rebuild ? 'primary compact' : 'secondary compact'} onClick={() => run('generate')} disabled={Boolean(operation)}>{operation === 'generate' ? (rebuild ? 'Rebuilding…' : 'Generating…') : (rebuild ? 'Rebuild project' : 'Generate project')}</button>}
        {canVerify && <button type="button" className="primary compact" onClick={() => run('verify')} disabled={Boolean(operation)}>{operation === 'verify' ? 'Verifying…' : 'Verify build'}</button>}
        {canPreview && <button type="button" className="primary compact" onClick={() => run('start-preview')} disabled={Boolean(operation)}>{operation === 'start-preview' ? 'Starting…' : 'Start preview'}</button>}
        {previewRunning && <button type="button" className="secondary compact" onClick={() => run('stop-preview')} disabled={Boolean(operation)}>{operation === 'stop-preview' ? 'Stopping…' : 'Stop preview'}</button>}
      </div>
    </header>

    {error && <div className="builder-alert" role="alert"><strong>Factory operation failed</strong><span>{error}</span></div>}

    {knowledgeIsNewerThanBuild && !error && <div className="builder-notice"><strong>Source material has changed since the last build.</strong><span>Rebuild the project so the new knowledge reaches the generated repository. The current build stays on disk.</span></div>}

    <section className="builder-layout">
      <aside className="builder-sidebar">
        <section className="builder-panel project-panel">
          <span className="builder-kicker">Project</span>
          <h1>{snapshot.project.name}</h1>
          <p>{snapshot.project.slug}</p>
          <dl className="builder-definition"><div><dt>Manifest</dt><dd>v{snapshot.project.manifestVersion}</dd></div><div><dt>Knowledge</dt><dd>{snapshot.project.knowledgePackHash ? 'attached' : 'manifest only'}</dd></div><div><dt>Workspace</dt><dd>{snapshot.project.workspacePath ? 'materialised' : 'not generated'}</dd></div></dl>
        </section>

        <section className="builder-panel metric-grid" aria-label="Project metrics">
          <div><span>Cost</span><strong>£{snapshot.metrics.costGbp.toFixed(2)}</strong></div>
          <div><span>Events</span><strong>{snapshot.metrics.eventCount}</strong></div>
          <div><span>Runtime</span><strong>{duration(snapshot.metrics.durationMs)}</strong></div>
          <div><span>Interventions</span><strong>{snapshot.metrics.interventions}</strong></div>
        </section>

        <SourcePanel
          knowledge={snapshot.knowledge}
          declaredSources={snapshot.declaredSources}
          disabled={snapshot.project.state === 'generating'}
          busy={operation === 'ingest'}
          onIngest={ingest}
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
        {selection && <ContentEditor
          selection={selection}
          override={activeOverride}
          onSave={saveEdit}
          onRevert={revertEdit}
          onClose={() => setSelection(null)}
          busy={savingEdit}
        />}

        {previewRunning && !selection && <section className="builder-panel">
          <span className="builder-kicker">Editing</span>
          <p className="builder-empty">Click any heading or paragraph in the preview to edit it. {overrides.length > 0 ? `${overrides.length} edit${overrides.length === 1 ? '' : 's'} saved.` : 'Edits are kept and replayed over every rebuild.'}</p>
        </section>}

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
          <div className="event-list">{snapshot.events.length ? snapshot.events.slice().reverse().map((event) => <article key={event.id}><div className="event-line"><span className={`event-dot ${event.type.endsWith('.failed') ? 'failed' : event.type.endsWith('.succeeded') || event.type.includes('generated') || event.type.includes('materialised') ? 'passed' : ''}`} /><strong>{label(event.type)}</strong></div><p>{eventSummary(event)}</p><time>{new Date(event.timestamp).toLocaleTimeString()}</time></article>) : <p className="builder-empty">Factory events will appear here as real work happens.</p>}</div>
        </section>
      </aside>
    </section>
  </main>;
}
