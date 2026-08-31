import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildProjectManifest, type Answers, type CapabilityDecisions, type SourceReference } from '@app-builder/factory-core';
import App from './App';
import { projectTypeConfig, type ProjectType } from './intake/catalog';
import { BuilderWorkspace } from './workspace/BuilderWorkspace';
import { approveIntake, listProjects, replayIntakeBundle, type ApprovedIntakeBundle, type IntakeBundleDrift, type ProjectSummary, type ReplayedIntakeSummary } from './service/client';

const DRAFT_KEY = 'app-builder:intake-draft:v1';

type ApprovedDraft = {
  stage?: string;
  projectType?: ProjectType;
  mode?: string;
  answers?: Answers;
  sourceReferences?: SourceReference[];
  capabilityDecisions?: CapabilityDecisions;
  approvedContract?: unknown;
};

type ApprovedIntake = {
  projectType: ProjectType;
  mode: string;
  answers: Answers;
  sourceReferences: SourceReference[];
  capabilityDecisions: CapabilityDecisions;
};

type Route = { view: 'intake' } | { view: 'projects' } | { view: 'workspace'; projectId: string };

function routeFromLocation(): Route {
  const match = window.location.pathname.match(/^\/builder\/([^/]+)$/);
  if (match) return { view: 'workspace', projectId: decodeURIComponent(match[1]) };
  if (window.location.pathname === '/builder') return { view: 'projects' };
  return { view: 'intake' };
}

// The browser holds the operator's approved answers; the factory holds the
// durable record of them. This reads the first so the second can be minted, and
// builds a manifest locally only to describe the tile.
function approvedIntake(): ApprovedIntake | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ApprovedDraft;
    if (draft.stage !== 'approved' || !draft.approvedContract || !draft.projectType || !draft.answers) return null;
    return {
      projectType: draft.projectType,
      mode: draft.mode ?? 'standard',
      answers: draft.answers,
      sourceReferences: draft.sourceReferences ?? [],
      capabilityDecisions: draft.capabilityDecisions ?? {},
    };
  } catch {
    return null;
  }
}

function describeIntake(intake: ApprovedIntake | null) {
  if (!intake) return null;
  try {
    return buildProjectManifest({
      projectType: intake.projectType,
      answers: intake.answers,
      projectTypesConfig: projectTypeConfig,
      sourceReferences: intake.sourceReferences,
      capabilityDecisions: intake.capabilityDecisions,
    });
  } catch {
    return null;
  }
}

function downloadBundle(bundle: ApprovedIntakeBundle) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `approved-intake-${bundle.projectManifest.project.slug}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** What the operator is accepting as reused, before a rerun spends anything. */
function ReplaySummary({ reused, drift }: { reused: ReplayedIntakeSummary; drift: IntakeBundleDrift[] }) {
  const blocking = drift.filter((entry) => entry.severity === 'blocking');
  return <section className="replay-summary">
    <span className="builder-kicker">Reusing approved intake</span>
    <h3>{reused.projectName}</h3>
    <div className="project-facts">
      <span>{reused.answeredQuestions}/{reused.totalQuestions} answers</span>
      <span>questionnaire {reused.questionnaireVersion}</span>
      <span>{reused.acceptedDefaults.length} accepted defaults</span>
      <span>{reused.sourceReferences.length} source references</span>
    </div>
    <p>Approved {new Date(reused.approvedAt).toLocaleString()}. The decisions are reused; the build, evidence and checkpoints are new.</p>
    {drift.length > 0 && <ul className={blocking.length ? 'replay-drift blocking' : 'replay-drift'}>
      {drift.map((entry) => <li key={`${entry.code}-${entry.detail}`}><strong>{entry.severity}</strong> {entry.detail}</li>)}
    </ul>}
  </section>;
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function ProjectsHome({ onOpen }: { onOpen: (projectId: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replay, setReplay] = useState<{ reused: ReplayedIntakeSummary; drift: IntakeBundleDrift[]; projectId: string } | null>(null);
  const [error, setError] = useState('');
  const intake = useMemo(() => approvedIntake(), []);
  const manifest = useMemo(() => describeIntake(intake), [intake]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setProjects(await listProjects()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Creating a project records the approved intake durably first, then starts
  // the run from that record. A rerun therefore replays the same path a first
  // run took, rather than depending on a browser draft that may be gone.
  async function createFromIntake() {
    if (!intake || !manifest) return;
    setCreating(true);
    setError('');
    try {
      const existing = projects.find((project) => project.slug === manifest.project.slug);
      if (existing) { onOpen(existing.id); return; }
      const bundle = await approveIntake({ ...intake, feedback: [] });
      const result = await replayIntakeBundle(bundle);
      onOpen(result.project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setCreating(false); }
  }

  /** Replay an approved intake the operator kept on disk. Nothing generated is
   * imported: only the decisions come back, and a fresh run follows. */
  async function importBundle(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setReplaying(true);
    setError('');
    setReplay(null);
    try {
      const bundle = JSON.parse(await file.text()) as ApprovedIntakeBundle;
      const result = await replayIntakeBundle(bundle);
      setReplay({ reused: result.reused, drift: result.drift, projectId: result.project.id });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setReplaying(false); }
  }

  async function downloadApprovedIntake() {
    if (!intake) return;
    setError('');
    try { downloadBundle(await approveIntake({ ...intake, feedback: [] })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <main className="projects-shell">
    <header className="projects-topbar"><button type="button" className="builder-brand" onClick={() => navigate('/')}><span className="brand-mark">A</span><span>App Builder</span></button><button type="button" className="secondary compact" onClick={() => navigate('/')}>New intake</button></header>
    <section className="projects-hero"><span className="eyebrow">Builder Console</span><h1>Projects become durable factory work.</h1><p className="lede">Generation, verification, preview, tasks, checkpoints, costs and progress all come from the factory service. The browser does not simulate build state.</p></section>
    {error && <div className="projects-error" role="alert"><strong>Factory service unavailable</strong><span>{error}</span><small>Run the Console through the combined development stack so `/api` can reach the loopback factory service.</small></div>}
    <section className="projects-grid">
      {manifest && <article className="project-tile approved-intake-tile"><span className="builder-kicker">Approved intake</span><h2>{manifest.project.name}</h2><p>{manifest.project.primaryGoal}</p><div className="project-facts"><span>{manifest.project.type.replaceAll('-', ' ')}</span><span>Manifest v{manifest.schemaVersion}</span><span>{manifest.majorSurfaces.length} surfaces</span></div><button type="button" className="primary" onClick={createFromIntake} disabled={creating}>{creating ? 'Creating project…' : projects.some((project) => project.slug === manifest.project.slug) ? 'Open existing project →' : 'Create factory project →'}</button><button type="button" className="text-button" onClick={downloadApprovedIntake}>Download approved intake bundle</button></article>}
      {!manifest && <article className="project-tile empty-intake-tile"><span className="builder-kicker">No approved intake</span><h2>Define the Build Contract first.</h2><p>The factory will not begin substantial generation through an ambiguous browser prompt.</p><button type="button" className="primary" onClick={() => navigate('/')}>Start intake →</button></article>}
      {projects.map((project) => <article className="project-tile" key={project.id}><div className="project-tile-heading"><span className={`state-pill state-${project.state}`}>{project.state}</span><span>{project.type.replaceAll('-', ' ')}</span></div><h2>{project.name}</h2><p>{project.workspacePath ? 'Standalone workspace materialised' : 'Ready for deterministic generation'}</p><div className="project-facts"><span>Manifest v{project.manifestVersion}</span><span>{project.knowledgePackHash ? 'Knowledge attached' : 'Manifest only'}</span></div><button type="button" className="secondary" onClick={() => onOpen(project.id)}>Open workspace →</button></article>)}
    </section>
    <section className="replay-panel">
      <div>
        <span className="builder-kicker">Rerun an approved intake</span>
        <h2>Replay a saved approval instead of answering again.</h2>
        <p>Import an approved intake bundle to start a fresh run from the same decisions. The Build Contract and Manifest are rebuilt by this factory; the build, evidence and checkpoints are new. Generated output is never imported.</p>
      </div>
      <label className="file-drop">
        <strong>{replaying ? 'Replaying approved intake…' : 'Choose an approved intake bundle'}</strong>
        <span>A questionnaire or schema that has moved since the approval is refused rather than coerced.</span>
        <input aria-label="Replay approved intake bundle" type="file" accept="application/json" onChange={(event) => importBundle(event.target.files)} />
      </label>
      {replay && <div>
        <ReplaySummary reused={replay.reused} drift={replay.drift} />
        <button type="button" className="primary" onClick={() => onOpen(replay.projectId)}>Open the replayed project →</button>
      </div>}
    </section>
    {loading && <p className="projects-loading">Reading durable projects…</p>}
  </main>;
}

declare const __APP_BUILDER_EXPECTED_INSTANCE__: string;

/**
 * Refuse a factory this Console was not started against.
 *
 * A Console is only meaningful next to the factory that holds its projects, and
 * the proxy that connects them is configuration that can change under a running
 * server. When it did, this Console listed another factory's businesses and
 * looked entirely normal doing it — the failure has no symptom, which is what
 * makes it worth a check rather than a convention.
 *
 * `unknown` means no expectation was declared, which is the ordinary case for a
 * Console started against a factory somebody else is running. There is nothing
 * to verify then, and inventing a complaint would be worse than staying quiet.
 */
function useFactoryIdentity(): 'checking' | 'ok' | 'unknown' | 'mismatch' {
  const expected = typeof __APP_BUILDER_EXPECTED_INSTANCE__ === 'string' ? __APP_BUILDER_EXPECTED_INSTANCE__ : '';
  const [state, setState] = useState<'checking' | 'ok' | 'unknown' | 'mismatch'>(expected ? 'checking' : 'unknown');
  useEffect(() => {
    if (!expected) return;
    let live = true;
    (async () => {
      try {
        const response = await fetch('/api/health');
        const payload = await response.json() as { instance?: string };
        if (live) setState(payload?.instance === expected ? 'ok' : 'mismatch');
      } catch {
        // A factory that cannot be reached is a different problem, and the
        // surfaces below already report their own failures.
        if (live) setState('ok');
      }
    })();
    return () => { live = false; };
  }, [expected]);
  return state;
}

export default function ConsoleRoot() {
  const [route, setRoute] = useState<Route>(() => routeFromLocation());
  const identity = useFactoryIdentity();
  useEffect(() => {
    const update = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  if (identity === 'mismatch') return <main className="console-shell"><section className="projects-hero"><span className="eyebrow">Wrong factory</span><h1>This Console is connected to a factory it was not started against.</h1><p className="lede">The projects it would show belong to somebody else's factory, so it is showing nothing instead. This usually means another factory owns the port this Console proxies to. Restart the stack, or point it at the right one with <code>--service-port</code>.</p></section></main>;
  if (identity === 'checking') return <main className="console-shell"><section className="projects-hero"><p className="lede">Checking which factory this Console is connected to…</p></section></main>;

  if (route.view === 'workspace') return <BuilderWorkspace projectId={route.projectId} onExit={() => navigate('/builder')} />;
  if (route.view === 'projects') return <ProjectsHome onOpen={(projectId) => navigate(`/builder/${encodeURIComponent(projectId)}`)} />;
  return <div className="console-intake-root"><App /><button type="button" className="builder-launch" onClick={() => navigate('/builder')}><span>Builder</span><strong>Projects & live builds →</strong></button></div>;
}
