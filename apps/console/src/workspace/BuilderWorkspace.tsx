import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  generateProject,
  loadWorkspace,
  startPreview,
  stopPreview,
  verifyProject,
  type ProjectSummary,
  type WorkspaceSnapshot,
} from '../service/client';
import './workspace.css';

type Device = 'desktop' | 'tablet' | 'mobile';
type Operation = 'generate' | 'verify' | 'start-preview' | 'stop-preview' | null;

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

export function BuilderWorkspace({ projectId, onExit }: { projectId: string; onExit: () => void }) {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [operation, setOperation] = useState<Operation>(null);
  const [error, setError] = useState('');

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

  const latestTask = snapshot?.tasks.at(-1) ?? null;
  const canGenerate = snapshot?.project.state === 'ready' || snapshot?.project.state === 'failed';
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
        {canGenerate && <button type="button" className="primary compact" onClick={() => run('generate')} disabled={Boolean(operation)}>{operation === 'generate' ? 'Generating…' : 'Generate project'}</button>}
        {canVerify && <button type="button" className="primary compact" onClick={() => run('verify')} disabled={Boolean(operation)}>{operation === 'verify' ? 'Verifying…' : 'Verify build'}</button>}
        {canPreview && <button type="button" className="primary compact" onClick={() => run('start-preview')} disabled={Boolean(operation)}>{operation === 'start-preview' ? 'Starting…' : 'Start preview'}</button>}
        {previewRunning && <button type="button" className="secondary compact" onClick={() => run('stop-preview')} disabled={Boolean(operation)}>{operation === 'stop-preview' ? 'Stopping…' : 'Stop preview'}</button>}
      </div>
    </header>

    {error && <div className="builder-alert" role="alert"><strong>Factory operation failed</strong><span>{error}</span></div>}

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
          {previewRunning ? <iframe title={`${snapshot.project.name} preview`} src={snapshot.preview.url ?? undefined} style={{ width: `${deviceWidth[device]}px` }} /> : <div className="preview-empty"><div className="preview-glyph">↗</div><h2>{snapshot.project.state === 'ready' ? 'Generate the product foundation.' : snapshot.project.state === 'generated' ? 'Verify the standalone build.' : 'Start the local preview.'}</h2><p>The preview process belongs to the factory service. Desktop, tablet and mobile frames all use the same generated repository.</p></div>}
        </div>
      </section>

      <aside className="activity-sidebar">
        <section className="builder-panel checkpoint-panel">
          <span className="builder-kicker">Latest checkpoint</span>
          {snapshot.checkpoint ? <><strong>{snapshot.checkpoint.summary}</strong><p>{snapshot.checkpoint.nextAction}</p><small>{new Date(snapshot.checkpoint.createdAt).toLocaleString()}</small></> : <p className="builder-empty">No durable checkpoint yet.</p>}
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
