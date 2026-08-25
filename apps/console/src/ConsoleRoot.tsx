import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildProjectManifest, type Answers, type CapabilityDecisions, type SourceReference } from '@app-builder/factory-core';
import App from './App';
import { projectTypeConfig, type ProjectType } from './intake/catalog';
import { BuilderWorkspace } from './workspace/BuilderWorkspace';
import { createProject, listProjects, type ProjectSummary } from './service/client';

const DRAFT_KEY = 'app-builder:intake-draft:v1';

type ApprovedDraft = {
  stage?: string;
  projectType?: ProjectType;
  answers?: Answers;
  sourceReferences?: SourceReference[];
  capabilityDecisions?: CapabilityDecisions;
  approvedContract?: unknown;
};

type Route = { view: 'intake' } | { view: 'projects' } | { view: 'workspace'; projectId: string };

function routeFromLocation(): Route {
  const match = window.location.pathname.match(/^\/builder\/([^/]+)$/);
  if (match) return { view: 'workspace', projectId: decodeURIComponent(match[1]) };
  if (window.location.pathname === '/builder') return { view: 'projects' };
  return { view: 'intake' };
}

function approvedManifest() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ApprovedDraft;
    if (draft.stage !== 'approved' || !draft.approvedContract || !draft.projectType || !draft.answers) return null;
    return buildProjectManifest({
      projectType: draft.projectType,
      answers: draft.answers,
      projectTypesConfig: projectTypeConfig,
      sourceReferences: draft.sourceReferences ?? [],
      capabilityDecisions: draft.capabilityDecisions ?? {},
    });
  } catch {
    return null;
  }
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function ProjectsHome({ onOpen }: { onOpen: (projectId: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const manifest = useMemo(() => approvedManifest(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setProjects(await listProjects()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function createFromIntake() {
    if (!manifest) return;
    setCreating(true);
    setError('');
    try {
      const existing = projects.find((project) => project.slug === manifest.project.slug);
      const project = existing ?? await createProject(manifest);
      onOpen(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setCreating(false); }
  }

  return <main className="projects-shell">
    <header className="projects-topbar"><button type="button" className="builder-brand" onClick={() => navigate('/')}><span className="brand-mark">A</span><span>App Builder</span></button><button type="button" className="secondary compact" onClick={() => navigate('/')}>New intake</button></header>
    <section className="projects-hero"><span className="eyebrow">Builder Console</span><h1>Projects become durable factory work.</h1><p className="lede">Generation, verification, preview, tasks, checkpoints, costs and progress all come from the factory service. The browser does not simulate build state.</p></section>
    {error && <div className="projects-error" role="alert"><strong>Factory service unavailable</strong><span>{error}</span><small>Run the Console through the combined development stack so `/api` can reach the loopback factory service.</small></div>}
    <section className="projects-grid">
      {manifest && <article className="project-tile approved-intake-tile"><span className="builder-kicker">Approved intake</span><h2>{manifest.project.name}</h2><p>{manifest.project.primaryGoal}</p><div className="project-facts"><span>{manifest.project.type.replaceAll('-', ' ')}</span><span>Manifest v{manifest.schemaVersion}</span><span>{manifest.majorSurfaces.length} surfaces</span></div><button type="button" className="primary" onClick={createFromIntake} disabled={creating}>{creating ? 'Creating project…' : projects.some((project) => project.slug === manifest.project.slug) ? 'Open existing project →' : 'Create factory project →'}</button></article>}
      {!manifest && <article className="project-tile empty-intake-tile"><span className="builder-kicker">No approved intake</span><h2>Define the Build Contract first.</h2><p>The factory will not begin substantial generation through an ambiguous browser prompt.</p><button type="button" className="primary" onClick={() => navigate('/')}>Start intake →</button></article>}
      {projects.map((project) => <article className="project-tile" key={project.id}><div className="project-tile-heading"><span className={`state-pill state-${project.state}`}>{project.state}</span><span>{project.type.replaceAll('-', ' ')}</span></div><h2>{project.name}</h2><p>{project.workspacePath ? 'Standalone workspace materialised' : 'Ready for deterministic generation'}</p><div className="project-facts"><span>Manifest v{project.manifestVersion}</span><span>{project.knowledgePackHash ? 'Knowledge attached' : 'Manifest only'}</span></div><button type="button" className="secondary" onClick={() => onOpen(project.id)}>Open workspace →</button></article>)}
    </section>
    {loading && <p className="projects-loading">Reading durable projects…</p>}
  </main>;
}

export default function ConsoleRoot() {
  const [route, setRoute] = useState<Route>(() => routeFromLocation());
  useEffect(() => {
    const update = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  if (route.view === 'workspace') return <BuilderWorkspace projectId={route.projectId} onExit={() => navigate('/builder')} />;
  if (route.view === 'projects') return <ProjectsHome onOpen={(projectId) => navigate(`/builder/${encodeURIComponent(projectId)}`)} />;
  return <div className="console-intake-root"><App /><button type="button" className="builder-launch" onClick={() => navigate('/builder')}><span>Builder</span><strong>Projects & live builds →</strong></button></div>;
}
