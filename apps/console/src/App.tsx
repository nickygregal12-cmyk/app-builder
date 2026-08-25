import { useMemo, useState } from 'react';
import {
  approveBuildContract,
  applyQuestionDefaults,
  buildBuildContract,
  buildProjectManifest,
  isAnswered,
  mergeQuestionnaires,
  questionsForMode,
  type AnswerValue,
  type Answers,
  type IntakeMode,
  type Question,
} from '@app-builder/factory-core';
import { base, projectTypeConfig, projectTypeEntries, questionnaireFor, type ProjectType } from './intake/catalog';

type Stage = 'start' | 'questions' | 'review' | 'approved';
type BuildContract = {
  version: number;
  status: string;
  project: { name: string; type: string; primaryGoal: string; targetUsers: string };
  coreJourneys: string[];
  enabledModules: string[];
  explicitlyExcluded: string[];
  acceptanceCriteria: string[];
  unresolvedHighImpactQuestions: string[];
  sourceInputs: string[];
  designDirection: string;
};

const modeCopy: Record<IntakeMode, { title: string; copy: string }> = {
  quick: { title: 'Quick', copy: 'Only decisions needed to shape a sensible V1.' },
  standard: { title: 'Standard', copy: 'Recommended balance of speed and specification.' },
  thorough: { title: 'Thorough', copy: 'Adds scale, migration, compliance and edge-case questions.' },
};

function listFromText(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function QuestionField({ question, value, onChange }: { question: Question; value: AnswerValue; onChange: (value: AnswerValue) => void }) {
  const stringValue = typeof value === 'string' ? value : '';
  if (question.type === 'textarea') return <textarea rows={5} value={stringValue} placeholder={question.placeholder} onChange={(event) => onChange(event.target.value)} />;
  if (question.type === 'text' || question.type === 'url') return <input type={question.type === 'url' ? 'url' : 'text'} value={stringValue} placeholder={question.placeholder} onChange={(event) => onChange(event.target.value)} />;
  if (question.type === 'list') {
    const items = Array.isArray(value) ? value : [];
    return <div><textarea rows={6} value={items.join('\n')} placeholder="One item per line" onChange={(event) => onChange(listFromText(event.target.value))} /><p className="field-note">One item per line. Keep these concrete — they become part of the Build Contract.</p></div>;
  }
  if (question.type === 'boolean') {
    return <div className="choice-row" role="group" aria-label={question.label}>{[true, false].map((option) => <button className={value === option ? 'choice active' : 'choice'} type="button" key={String(option)} onClick={() => onChange(option)}>{option ? 'Yes' : 'No'}</button>)}</div>;
  }
  if (question.type === 'single-select') {
    return <div className="choice-grid">{(question.options ?? []).map((option) => <button className={value === option ? 'choice active' : 'choice'} type="button" key={option} onClick={() => onChange(option)}>{option.replaceAll('-', ' ')}</button>)}</div>;
  }
  if (question.type === 'multi-select') {
    const values = Array.isArray(value) ? value : [];
    return <div className="choice-grid">{(question.options ?? []).map((option) => { const active = values.includes(option); return <button className={active ? 'choice active' : 'choice'} type="button" key={option} onClick={() => onChange(active ? values.filter((item) => item !== option) : [...values, option])}>{option}</button>; })}</div>;
  }
  if (question.type === 'company-identity') {
    const identity = typeof value === 'object' && value && !Array.isArray(value) ? value : {};
    return <div className="field-stack"><input value={identity.name ?? ''} placeholder="Company name" onChange={(event) => onChange({ ...identity, name: event.target.value })} /><input value={identity.legalName ?? ''} placeholder="Legal name (optional)" onChange={(event) => onChange({ ...identity, legalName: event.target.value })} /><textarea rows={4} value={identity.description ?? ''} placeholder="Short factual description of the company" onChange={(event) => onChange({ ...identity, description: event.target.value })} /></div>;
  }
  if (question.type === 'contact-details') {
    const contact = typeof value === 'object' && value && !Array.isArray(value) ? value : {};
    return <div className="field-stack two-col"><input value={contact.email ?? ''} placeholder="Email" onChange={(event) => onChange({ ...contact, email: event.target.value })} /><input value={contact.phone ?? ''} placeholder="Phone" onChange={(event) => onChange({ ...contact, phone: event.target.value })} /><input className="span-two" value={contact.address ?? ''} placeholder="Address / location" onChange={(event) => onChange({ ...contact, address: event.target.value })} /></div>;
  }
  return <textarea rows={4} value={stringValue} onChange={(event) => onChange(event.target.value)} />;
}

function ContractReview({ contract }: { contract: BuildContract }) {
  return <div className="contract-grid">
    <section className="contract-card span-two"><span className="card-kicker">Project</span><h3>{contract.project.name}</h3><p>{contract.project.primaryGoal}</p><dl><div><dt>Type</dt><dd>{contract.project.type.replaceAll('-', ' ')}</dd></div><div><dt>Users</dt><dd>{contract.project.targetUsers || 'Not specified'}</dd></div><div><dt>Design</dt><dd>{contract.designDirection.replaceAll('-', ' ')}</dd></div></dl></section>
    <section className="contract-card"><span className="card-kicker">Core journeys</span><ul>{contract.coreJourneys.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section className="contract-card"><span className="card-kicker">Enabled modules</span><div className="chips">{contract.enabledModules.map((item) => <span key={item}>{item}</span>)}</div></section>
    <section className="contract-card"><span className="card-kicker">Source material</span>{contract.sourceInputs.length ? <ul>{contract.sourceInputs.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No source material recorded yet.</p>}</section>
    <section className="contract-card"><span className="card-kicker">Explicitly excluded</span>{contract.explicitlyExcluded.length ? <ul>{contract.explicitlyExcluded.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No exclusions recorded.</p>}</section>
  </div>;
}

export default function App() {
  const [stage, setStage] = useState<Stage>('start');
  const [projectType, setProjectType] = useState<ProjectType>('marketing-site');
  const [mode, setMode] = useState<IntakeMode>('standard');
  const [answers, setAnswers] = useState<Answers>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [error, setError] = useState('');
  const [approvedContract, setApprovedContract] = useState<BuildContract | null>(null);

  const questions = useMemo(() => questionsForMode(mergeQuestionnaires(base, questionnaireFor(projectType)), mode).filter((question) => question.id !== 'project_type'), [projectType, mode]);
  const contract = useMemo(() => buildBuildContract({ projectType, answers, questions, projectTypesConfig: projectTypeConfig }) as BuildContract, [projectType, answers, questions]);
  const manifest = useMemo(() => buildProjectManifest({ projectType, answers, projectTypesConfig: projectTypeConfig }), [projectType, answers]);

  function start() {
    setAnswers(applyQuestionDefaults(questions, { project_type: projectType }));
    setQuestionIndex(0); setError(''); setApprovedContract(null); setStage('questions');
  }
  function reset() { setAnswers({}); setQuestionIndex(0); setError(''); setApprovedContract(null); setStage('start'); }
  function next() {
    const current = questions[questionIndex];
    if (current.required && !isAnswered(current, answers[current.id])) { setError('This is a build-shaping question, so it needs an answer before continuing.'); return; }
    setError('');
    if (questionIndex >= questions.length - 1) setStage('review'); else setQuestionIndex((index) => index + 1);
  }
  function approve() {
    try { setApprovedContract(approveBuildContract(contract) as BuildContract); setStage('approved'); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The Build Contract is not ready for approval.'); }
  }

  const current = questions[questionIndex];
  const progress = questions.length ? Math.round(((questionIndex + 1) / questions.length) * 100) : 0;

  return <main className="app-shell">
    <header className="topbar"><button type="button" className="brand" onClick={reset} aria-label="App Builder home"><span className="brand-mark">A</span><span>App Builder</span></button><div className="topbar-meta"><span>Foundation v0.2</span><span className="dot" /><span>Phase 1 intake</span></div></header>

    {stage === 'start' && <section className="start-layout">
      <div className="intro"><p className="eyebrow">New project</p><h1>Get the decisions right before the build starts.</h1><p className="lede">Choose the kind of project and how deep you want discovery to go. App Builder will only ask questions relevant to that shape of product, then generate a Build Contract for approval.</p></div>
      <div className="setup-panel">
        <div className="setup-section"><div className="section-heading"><span>01</span><div><h2>Project type</h2><p>This sets sensible module and infrastructure defaults.</p></div></div><div className="project-grid">{projectTypeEntries.map(([id, config]) => <button key={id} type="button" className={projectType === id ? 'project-card selected' : 'project-card'} onClick={() => setProjectType(id)}><strong>{config.label}</strong><span>{id}</span></button>)}</div></div>
        <div className="setup-section"><div className="section-heading"><span>02</span><div><h2>Discovery depth</h2><p>Use more questions only when the project warrants them.</p></div></div><div className="mode-grid">{(Object.entries(modeCopy) as [IntakeMode, (typeof modeCopy)[IntakeMode]][]).map(([id, copy]) => <button key={id} type="button" className={mode === id ? 'mode-card selected' : 'mode-card'} onClick={() => setMode(id)}><strong>{copy.title}</strong><span>{copy.copy}</span></button>)}</div></div>
        <div className="start-action"><div><strong>{questions.length} questions</strong><span> · no AI call required</span></div><button className="primary" type="button" onClick={start}>Start intake <span>→</span></button></div>
      </div>
    </section>}

    {stage === 'questions' && current && <section className="question-layout">
      <aside className="question-sidebar"><p className="eyebrow">{projectTypeConfig.projectTypes[projectType].label}</p><h2>{modeCopy[mode].title} intake</h2><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><p className="progress-copy">Question {questionIndex + 1} of {questions.length} · {progress}%</p><div className="principle-note"><strong>Why this exists</strong><p>Questions are cheaper than rebuilding the wrong architecture later.</p></div></aside>
      <div className="question-stage"><div className="question-meta"><span>{String(questionIndex + 1).padStart(2, '0')}</span><span>{current.impact ?? 'normal'} impact</span></div><h1>{current.label}</h1>{current.required && <p className="required-note">Required to shape V1</p>}<QuestionField question={current} value={answers[current.id]} onChange={(value) => { setAnswers((currentAnswers) => ({ ...currentAnswers, [current.id]: value })); setError(''); }} />{error && <div className="error-box" role="alert">{error}</div>}<div className="question-actions"><button className="secondary" type="button" onClick={() => questionIndex === 0 ? setStage('start') : setQuestionIndex((index) => index - 1)}>← Back</button><button className="primary" type="button" onClick={next}>{questionIndex === questions.length - 1 ? 'Review build contract' : 'Continue'} <span>→</span></button></div></div>
    </section>}

    {stage === 'review' && <section className="review-layout"><div className="review-heading"><div><p className="eyebrow">Build Contract</p><h1>Review the decisions before anything expensive happens.</h1></div><div className={contract.unresolvedHighImpactQuestions.length ? 'readiness warning' : 'readiness ready'}><span>{contract.unresolvedHighImpactQuestions.length ? 'Needs attention' : 'Ready for approval'}</span><strong>{contract.unresolvedHighImpactQuestions.length ? `${contract.unresolvedHighImpactQuestions.length} blockers` : '0 blockers'}</strong></div></div><ContractReview contract={contract} />{contract.unresolvedHighImpactQuestions.length > 0 && <div className="error-box"><strong>Resolve before build:</strong> {contract.unresolvedHighImpactQuestions.join(' · ')}</div>}{error && <div className="error-box" role="alert">{error}</div>}<div className="review-actions"><button className="secondary" type="button" onClick={() => { setStage('questions'); setQuestionIndex(Math.max(questions.length - 1, 0)); }}>← Edit answers</button><button className="primary" type="button" onClick={approve} disabled={contract.unresolvedHighImpactQuestions.length > 0}>Approve Build Contract <span>→</span></button></div></section>}

    {stage === 'approved' && approvedContract && <section className="approved-layout"><div className="approved-hero"><div className="success-mark">✓</div><p className="eyebrow">Approved</p><h1>{approvedContract.project.name} is ready for deterministic generation.</h1><p className="lede">The requirements are now a stable contract. Phase 2 will use this manifest to compose templates and recipes before any novel AI implementation work.</p></div><div className="output-grid"><section className="json-card"><div className="json-title"><span>BUILD CONTRACT</span><strong>approved</strong></div><pre>{JSON.stringify(approvedContract, null, 2)}</pre></section><section className="json-card"><div className="json-title"><span>PROJECT MANIFEST</span><strong>generated</strong></div><pre>{JSON.stringify(manifest, null, 2)}</pre></section></div><div className="review-actions"><button className="secondary" type="button" onClick={reset}>Start another project</button></div></section>}
  </main>;
}
