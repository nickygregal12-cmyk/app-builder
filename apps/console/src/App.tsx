import { useEffect, useMemo, useRef, useState } from 'react';
import {
  approveBuildContract,
  applyQuestionDefaults,
  buildBuildContract,
  buildProjectManifest,
  collectAcceptedDefaultEvidence,
  createFeedbackEvent,
  createIntakeSession,
  createSourceReference,
  isAnswered,
  mergeQuestionnaires,
  normalizeListAnswer,
  questionsForMode,
  serializeIntakeBundle,
  type AnswerValue,
  type Answers,
  type BuildContract,
  type CapabilityDecision,
  type CapabilityDecisions,
  type FeedbackEvent,
  type FeedbackType,
  type IntakeMode,
  type Question,
  type SourceKind,
  type SourceReference,
} from '@app-builder/factory-core';
import { base, projectTypeConfig, projectTypeEntries, questionnaireFor, type ProjectType } from './intake/catalog';
import './phase1.css';

type Stage = 'start' | 'questions' | 'sources' | 'review' | 'approved';
type SavedDraft = {
  version: 1 | 2;
  stage: Exclude<Stage, 'start'>;
  projectType: ProjectType;
  mode: IntakeMode;
  answers: Answers;
  sourceReferences: SourceReference[];
  feedback: FeedbackEvent[];
  questionIndex: number;
  approvedContract: BuildContract | null;
  capabilityDecisions?: CapabilityDecisions;
};

const DRAFT_KEY = 'app-builder:intake-draft:v1';
const modeCopy: Record<IntakeMode, { title: string; copy: string }> = {
  quick: { title: 'Quick', copy: 'Only decisions needed to shape a sensible V1.' },
  standard: { title: 'Standard', copy: 'Recommended balance of speed and specification.' },
  thorough: { title: 'Thorough', copy: 'Adds scale, migration, compliance and edge-case questions.' },
};


function sameValue(a: AnswerValue, b: AnswerValue) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * What an approved contract is for.
 *
 * Approval used to offer three downloads and no way forward, so the operator
 * who had just finished the questionnaire had to already know that creating the
 * project lives behind the Builder pill in the corner. The project is created
 * on the Builder screen, from the approved intake this one just wrote; this
 * hands over to that rather than starting a second way of doing it.
 */
function goToBuilder() {
  window.history.pushState({}, '', '/builder');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function sourceKindForFile(file: File): SourceKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return name.includes('logo') ? 'logo' : 'image';
  if (/\.(csv|xlsx?|ods)$/.test(name)) return 'spreadsheet';
  if (/\.(png|jpe?g|webp|gif|svg)$/.test(name)) return 'image';
  if (/\.(pdf|docx?|txt|md|rtf|pptx?)$/.test(name)) return 'document';
  return 'other';
}

// The textarea holds the operator's raw keystrokes. Trimming every line on each keystroke
// would delete a space the moment it is typed, so normalisation happens when the value
// leaves the field (question change, defaults applied, contract build), not while typing.
function ListField({ question, value, onChange }: { question: Question; value: AnswerValue; onChange: (value: AnswerValue) => void }) {
  const canonical = (Array.isArray(value) ? value.map((item) => String(item ?? '')) : []).join('\n');
  const [draft, setDraft] = useState(canonical);
  useEffect(() => {
    setDraft((current) => (normalizeListAnswer(current).join('\n') === canonical ? current : canonical));
  }, [canonical]);
  return <div><textarea aria-label={question.label} rows={6} value={draft} placeholder="One item per line" onChange={(event) => { setDraft(event.target.value); onChange(normalizeListAnswer(event.target.value)); }} /><p className="field-note">One item per line. Keep these concrete — they become part of the Build Contract.</p></div>;
}

function QuestionField({ question, value, onChange }: { question: Question; value: AnswerValue; onChange: (value: AnswerValue) => void }) {
  const stringValue = typeof value === 'string' ? value : '';
  if (question.type === 'textarea') return <textarea aria-label={question.label} rows={5} value={stringValue} placeholder={question.placeholder} onChange={(event) => onChange(event.target.value)} />;
  if (question.type === 'text' || question.type === 'url') return <input aria-label={question.label} type={question.type === 'url' ? 'url' : 'text'} value={stringValue} placeholder={question.placeholder} onChange={(event) => onChange(event.target.value)} />;
  if (question.type === 'list') return <ListField question={question} value={value} onChange={onChange} />;
  if (question.type === 'boolean') {
    return <div className="choice-row" role="group" aria-label={question.label}>{[true, false].map((option) => <button className={value === option ? 'choice active' : 'choice'} type="button" key={String(option)} onClick={() => onChange(option)}>{option ? 'Yes' : 'No'}</button>)}</div>;
  }
  if (question.type === 'single-select') {
    return <div className="choice-grid" role="group" aria-label={question.label}>{(question.options ?? []).map((option) => <button className={value === option ? 'choice active' : 'choice'} type="button" key={option} onClick={() => onChange(option)}>{option.replaceAll('-', ' ')}</button>)}</div>;
  }
  if (question.type === 'multi-select') {
    const values = Array.isArray(value) ? value : [];
    return <div className="choice-grid" role="group" aria-label={question.label}>{(question.options ?? []).map((option) => { const active = values.includes(option); return <button className={active ? 'choice active' : 'choice'} type="button" key={option} onClick={() => onChange(active ? values.filter((item) => item !== option) : [...values, option])}>{option}</button>; })}</div>;
  }
  if (question.type === 'company-identity') {
    const identity = typeof value === 'object' && value && !Array.isArray(value) ? value : {};
    return <div className="field-stack"><input aria-label="Company name" value={identity.name ?? ''} placeholder="Company name" onChange={(event) => onChange({ ...identity, name: event.target.value })} /><input aria-label="Company legal name" value={identity.legalName ?? ''} placeholder="Legal name (optional)" onChange={(event) => onChange({ ...identity, legalName: event.target.value })} /><textarea aria-label="Company description" rows={4} value={identity.description ?? ''} placeholder="Short factual description of the company" onChange={(event) => onChange({ ...identity, description: event.target.value })} /></div>;
  }
  if (question.type === 'contact-details') {
    const contact = typeof value === 'object' && value && !Array.isArray(value) ? value : {};
    return <div className="field-stack two-col"><input aria-label="Public email" value={contact.email ?? ''} placeholder="Email" onChange={(event) => onChange({ ...contact, email: event.target.value })} /><input aria-label="Public phone" value={contact.phone ?? ''} placeholder="Phone" onChange={(event) => onChange({ ...contact, phone: event.target.value })} /><input aria-label="Public address" className="span-two" value={contact.address ?? ''} placeholder="Address / location" onChange={(event) => onChange({ ...contact, address: event.target.value })} /></div>;
  }
  return <textarea aria-label={question.label} rows={4} value={stringValue} onChange={(event) => onChange(event.target.value)} />;
}

function CapabilityReview({ contract, onDecision }: { contract: BuildContract; onDecision: (module: string, decision: CapabilityDecision) => void }) {
  const unavailable = contract.capabilityPlan.filter((item) => item.availability !== 'ready');
  if (!unavailable.length) return null;
  return <section className="followup-panel">
    <div><span className="card-kicker">Capability buildability</span><h3>Resolve requested capabilities that do not have a ready deterministic recipe.</h3><p>The requirement is never discarded. Exclude it from V1 or retain it as explicit custom work for a later implementation stage.</p></div>
    <div>{unavailable.map((item) => <article key={item.module} className="followup-item">
      <strong>{item.module.replaceAll('-', ' ')}</strong><span>Factory availability: {item.availability.replaceAll('-', ' ')}</span>
      <div className="choice-row" role="group" aria-label={`${item.module} capability decision`}>
        <button type="button" className={item.decision === 'exclude' ? 'choice active' : 'choice'} onClick={() => onDecision(item.module, 'exclude')}>Exclude from V1</button>
        <button type="button" className={item.decision === 'custom-work' ? 'choice active' : 'choice'} onClick={() => onDecision(item.module, 'custom-work')}>Keep as custom work</button>
      </div>
    </article>)}</div>
  </section>;
}

function ContractReview({ contract, onEditQuestion, onEditSources }: { contract: BuildContract; onEditQuestion: (id: string) => void; onEditSources: () => void }) {
  return <div className="contract-grid">
    <section className="contract-card span-two"><div className="card-heading"><span className="card-kicker">Project</span><button type="button" className="text-button" onClick={() => onEditQuestion('project_name')}>Edit</button></div><h3>{contract.project.name}</h3><p>{contract.project.primaryGoal}</p><dl><div><dt>Type</dt><dd>{contract.project.type.replaceAll('-', ' ')}</dd></div><div><dt>Users</dt><dd>{contract.project.targetUsers || 'Not specified'}</dd></div><div><dt>Design</dt><dd>{contract.designDirection.replaceAll('-', ' ')}</dd></div></dl></section>
    <section className="contract-card"><div className="card-heading"><span className="card-kicker">Core journeys</span><button type="button" className="text-button" onClick={() => onEditQuestion('must_have')}>Edit</button></div><ul>{contract.coreJourneys.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section className="contract-card"><div className="card-heading"><span className="card-kicker">Major pages / surfaces</span><button type="button" className="text-button" onClick={() => onEditQuestion('major_surfaces')}>Edit</button></div><ul>{contract.majorSurfaces.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section className="contract-card"><span className="card-kicker">Ready deterministic modules</span><div className="chips">{contract.enabledModules.length ? contract.enabledModules.map((item) => <span key={item}>{item}</span>) : <span>none</span>}</div>{contract.customWorkModules.length > 0 && <p><strong>Custom work:</strong> {contract.customWorkModules.join(', ')}</p>}</section>
    <section className="contract-card"><div className="card-heading"><span className="card-kicker">Source material</span><button type="button" className="text-button" onClick={onEditSources}>Edit</button></div>{contract.sourceInputs.length ? <ul>{contract.sourceInputs.map((item) => <li key={item.id}><strong>{item.label}</strong><br /><small>{item.kind.replaceAll('-', ' ')}{item.uri ? ` · ${item.uri}` : ''}</small></li>)}</ul> : <p>No structured source references recorded.</p>}</section>
    <section className="contract-card"><div className="card-heading"><span className="card-kicker">Explicitly excluded</span><button type="button" className="text-button" onClick={() => onEditQuestion('out_of_scope')}>Edit</button></div>{contract.explicitlyExcluded.length || contract.excludedModules.length ? <ul>{[...contract.explicitlyExcluded, ...contract.excludedModules.map((item) => `${item} capability`)].map((item) => <li key={item}>{item}</li>)}</ul> : <p>No exclusions recorded.</p>}</section>
  </div>;
}

export default function App() {
  const [stage, setStage] = useState<Stage>('start');
  const [projectType, setProjectType] = useState<ProjectType>('marketing-site');
  const [mode, setMode] = useState<IntakeMode>('standard');
  const [answers, setAnswers] = useState<Answers>({});
  const [sourceReferences, setSourceReferences] = useState<SourceReference[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [error, setError] = useState('');
  const [approvedContract, setApprovedContract] = useState<BuildContract | null>(null);
  const [capabilityDecisions, setCapabilityDecisions] = useState<CapabilityDecisions>({});
  const [draftAvailable, setDraftAvailable] = useState(() => typeof window !== 'undefined' && localStorage.getItem(DRAFT_KEY) !== null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceLabel, setSourceLabel] = useState('Existing website');
  const [sourcePurpose, setSourcePurpose] = useState('Research or migration reference');
  const [learningType, setLearningType] = useState<FeedbackType>('missing-requirement');
  const [learningDetail, setLearningDetail] = useState('');
  const touchedQuestions = useRef(new Set<string>());

  const mergedQuestions = useMemo(() => mergeQuestionnaires(base, questionnaireFor(projectType)), [projectType]);
  const questions = useMemo(() => questionsForMode(mergedQuestions, mode, answers).filter((question) => question.id !== 'project_type'), [mergedQuestions, mode, answers]);
  const contract = useMemo(() => buildBuildContract({ projectType, answers, questions, projectTypesConfig: projectTypeConfig, sourceReferences, capabilityDecisions }), [projectType, answers, questions, sourceReferences, capabilityDecisions]);
  const manifest = useMemo(() => buildProjectManifest({ projectType, answers, projectTypesConfig: projectTypeConfig, sourceReferences, capabilityDecisions }), [projectType, answers, sourceReferences, capabilityDecisions]);
  const blockerCount = contract.unresolvedHighImpactQuestions.length + contract.unresolvedCapabilityDecisions.length;

  useEffect(() => {
    if (stage === 'start') return;
    const draft: SavedDraft = { version: 2, stage, projectType, mode, answers, sourceReferences, feedback, questionIndex, approvedContract, capabilityDecisions };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setDraftAvailable(true);
  }, [stage, projectType, mode, answers, sourceReferences, feedback, questionIndex, approvedContract, capabilityDecisions]);

  function start() {
    const seed: Answers = { project_type: projectType };
    const visible = questionsForMode(mergedQuestions, mode, seed).filter((question) => question.id !== 'project_type');
    setAnswers(applyQuestionDefaults(visible, seed));
    setSourceReferences([]); setFeedback([]); setQuestionIndex(0); setError(''); setApprovedContract(null); setCapabilityDecisions({}); touchedQuestions.current.clear(); setStage('questions');
  }

  function reset() {
    localStorage.removeItem(DRAFT_KEY); setDraftAvailable(false); setAnswers({}); setSourceReferences([]); setFeedback([]); setQuestionIndex(0); setError(''); setApprovedContract(null); setCapabilityDecisions({}); touchedQuestions.current.clear(); setStage('start');
  }

  function resume() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedDraft;
      setProjectType(saved.projectType); setMode(saved.mode); setAnswers(saved.answers ?? {}); setSourceReferences(saved.sourceReferences ?? []); setFeedback(saved.feedback ?? []); setQuestionIndex(saved.questionIndex ?? 0); setApprovedContract(saved.approvedContract ?? null); setCapabilityDecisions(saved.capabilityDecisions ?? {}); setStage(saved.stage ?? 'questions'); setError('');
    } catch {
      localStorage.removeItem(DRAFT_KEY); setDraftAvailable(false); setError('The saved draft could not be restored, so it was cleared.');
    }
  }

  function updateAnswer(question: Question, value: AnswerValue) {
    const previous = answers[question.id];
    if (touchedQuestions.current.has(question.id) && !sameValue(previous, value)) setFeedback((events) => [...events, createFeedbackEvent('corrected-answer', { questionId: question.id, previousValue: previous, nextValue: value })]);
    touchedQuestions.current.add(question.id);
    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(applyQuestionDefaults(questionsForMode(mergedQuestions, mode, nextAnswers), nextAnswers));
    setCapabilityDecisions({});
    setError('');
  }

  function next() {
    const current = questions[questionIndex];
    if (!current) { setStage('sources'); return; }
    if (current.required && !isAnswered(current, answers[current.id])) { setError('This is a build-shaping question, so it needs an answer before continuing.'); return; }
    setError('');
    if (questionIndex >= questions.length - 1) setStage('sources'); else setQuestionIndex((index) => index + 1);
  }

  function markNotRelevant() {
    const current = questions[questionIndex];
    if (!current || current.required) return;
    setFeedback((events) => [...events, createFeedbackEvent('unnecessary-question', { questionId: current.id, detail: 'Marked not relevant during intake.' })]);
    setAnswers((currentAnswers) => ({ ...currentAnswers, [current.id]: undefined }));
    setCapabilityDecisions({});
    next();
  }

  function addUrlSource() {
    try { new URL(sourceUrl); }
    catch { setError('Enter a complete source URL, including https://'); return; }
    const source = createSourceReference({ id: `url-${Date.now()}`, kind: 'url', label: sourceLabel || sourceUrl, uri: sourceUrl, purpose: sourcePurpose, provenance: 'user-supplied' });
    setSourceReferences((items) => [...items, source]); setSourceUrl(''); setError('');
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const additions = Array.from(files).map((file, index) => createSourceReference({ id: `file-${Date.now()}-${index}`, kind: sourceKindForFile(file), label: file.name, name: file.name, mimeType: file.type || undefined, size: file.size, provenance: 'user-supplied', purpose: 'Build input' }));
    setSourceReferences((items) => [...items, ...additions]);
  }

  function goToReview() {
    setFeedback((events) => collectAcceptedDefaultEvidence(questions, answers, events));
    setError(''); setStage('review');
  }

  function editQuestion(id: string) {
    const index = questions.findIndex((question) => question.id === id);
    if (index >= 0) { setQuestionIndex(index); setStage('questions'); }
  }

  function setCapabilityDecision(module: string, decision: CapabilityDecision) {
    setCapabilityDecisions((current) => ({ ...current, [module]: decision }));
    setError('');
  }

  function approve() {
    try { setApprovedContract(approveBuildContract(contract)); setStage('approved'); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The Build Contract is not ready for approval.'); }
  }

  function addLearning() {
    if (!learningDetail.trim()) return;
    setFeedback((events) => [...events, createFeedbackEvent(learningType, { detail: learningDetail.trim() })]);
    setLearningDetail('');
  }

  function makeSession(status: 'in-progress' | 'ready-for-review' | 'approved') {
    return {
      ...createIntakeSession({ projectType, mode, questionnaireVersion: '1.3.0', questions, seedAnswers: answers, sourceReferences, feedback: collectAcceptedDefaultEvidence(questions, answers, feedback) }),
      status,
      answers,
      sourceReferences,
      feedback: collectAcceptedDefaultEvidence(questions, answers, feedback),
      capabilityDecisions
    };
  }

  function exportBundle() {
    const finalContract = approvedContract ?? contract;
    const status = approvedContract ? 'approved' : contract.status === 'ready-for-review' ? 'ready-for-review' : 'in-progress';
    downloadJson(`${manifest.project.slug}-intake.json`, serializeIntakeBundle({ session: makeSession(status), buildContract: finalContract, projectManifest: manifest }));
  }

  const current = questions[Math.min(questionIndex, Math.max(questions.length - 1, 0))];
  const progress = questions.length ? Math.round(((Math.min(questionIndex, questions.length - 1) + 1) / questions.length) * 100) : 0;

  return <main className="app-shell">
    <header className="topbar"><button type="button" className="brand" onClick={reset} aria-label="App Builder home"><span className="brand-mark">A</span><span>App Builder</span></button><div className="topbar-meta"><span>Manifest v2</span><span className="dot" /><span>Composition prep</span></div></header>

    {stage === 'start' && <section className="start-layout">
      <div className="intro"><p className="eyebrow">New project</p><h1>Get the decisions right before the build starts.</h1><p className="lede">Choose the kind of project and how deep you want discovery to go. App Builder asks only relevant questions, then produces a reviewed Build Contract and portable manifest.</p>{draftAvailable && <button className="resume-button" type="button" onClick={resume}>Resume saved intake →</button>}{error && <div className="error-box" role="alert">{error}</div>}</div>
      <div className="setup-panel">
        <div className="setup-section"><div className="section-heading"><span>01</span><div><h2>Project type</h2><p>This sets sensible module and infrastructure defaults.</p></div></div><div className="project-grid">{projectTypeEntries.map(([id, config]) => <button key={id} type="button" className={projectType === id ? 'project-card selected' : 'project-card'} onClick={() => setProjectType(id)}><strong>{config.label}</strong><span>{id}</span></button>)}</div></div>
        <div className="setup-section"><div className="section-heading"><span>02</span><div><h2>Discovery depth</h2><p>Use more questions only when the project warrants them.</p></div></div><div className="mode-grid">{(Object.entries(modeCopy) as [IntakeMode, (typeof modeCopy)[IntakeMode]][]).map(([id, copy]) => <button key={id} type="button" className={mode === id ? 'mode-card selected' : 'mode-card'} onClick={() => setMode(id)}><strong>{copy.title}</strong><span>{copy.copy}</span></button>)}</div></div>
        <div className="start-action"><div><strong>{questionsForMode(mergedQuestions, mode, { project_type: projectType }).filter((question) => question.id !== 'project_type').length} starting questions</strong><span> · conditional follow-ups only when relevant · no AI required</span></div><button className="primary" type="button" onClick={start}>Start intake <span>→</span></button></div>
      </div>
    </section>}

    {stage === 'questions' && current && <section className="question-layout">
      <aside className="question-sidebar"><p className="eyebrow">{projectTypeConfig.projectTypes[projectType].label}</p><h2>{modeCopy[mode].title} intake</h2><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><p className="progress-copy">Question {Math.min(questionIndex + 1, questions.length)} of {questions.length} · {progress}%</p><div className="principle-note"><strong>Adaptive intake</strong><p>Later questions can appear or disappear from your answers. Hidden questions never become blockers.</p></div></aside>
      <div className="question-stage"><div className="question-meta"><span>{String(questionIndex + 1).padStart(2, '0')}</span><span>{current.impact ?? 'normal'} impact</span></div><h1>{current.label}</h1>{current.required && <p className="required-note">Required to shape V1</p>}<QuestionField key={current.id} question={current} value={answers[current.id]} onChange={(value) => updateAnswer(current, value)} />{error && <div className="error-box" role="alert">{error}</div>}<div className="question-actions"><button className="secondary" type="button" onClick={() => questionIndex === 0 ? setStage('start') : setQuestionIndex((index) => Math.max(0, index - 1))}>← Back</button><div className="action-cluster">{!current.required && <button className="text-button" type="button" onClick={markNotRelevant}>Not relevant</button>}<button className="primary" type="button" onClick={next}>{questionIndex >= questions.length - 1 ? 'Add source material' : 'Continue'} <span>→</span></button></div></div></div>
    </section>}

    {stage === 'sources' && <section className="review-layout"><div className="review-heading"><div><p className="eyebrow">Source material</p><h1>Record what the build can rely on.</h1><p className="lede">References and file metadata are captured here. Phase 3 already provides deterministic URL/document/image normalization; browser intake deliberately does not parse local file bytes itself.</p></div><div className="readiness ready"><span>Recorded</span><strong>{sourceReferences.length} sources</strong></div></div><div className="source-layout"><section className="source-panel"><span className="card-kicker">Website / URL</span><div className="field-stack"><input aria-label="Source label" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Existing website" /><input aria-label="Source URL" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com" /><input aria-label="Source purpose" value={sourcePurpose} onChange={(event) => setSourcePurpose(event.target.value)} placeholder="What should the factory use it for?" /><button className="secondary" type="button" onClick={addUrlSource}>Add URL source</button></div><span className="card-kicker source-file-kicker">Files</span><label className="file-drop"><strong>Add logos, photos, screenshots or documents</strong><span>Filename/type/size are recorded here; the factory ingestion layer processes content.</span><input aria-label="Add source files" type="file" multiple onChange={(event) => addFiles(event.target.files)} /></label>{error && <div className="error-box" role="alert">{error}</div>}</section><section className="source-panel"><span className="card-kicker">Source inventory</span>{sourceReferences.length === 0 ? <div className="empty-state"><strong>No sources yet</strong><p>You can continue without them. The Build Contract will record that explicitly.</p></div> : <div className="source-list">{sourceReferences.map((source) => <article key={source.id} className="source-item"><div><strong>{source.label}</strong><span>{source.kind.replaceAll('-', ' ')}{source.name ? ` · ${source.name}` : ''}{source.size ? ` · ${Math.max(1, Math.round(source.size / 1024))} KB` : ''}</span>{source.uri && <small>{source.uri}</small>}</div><button type="button" className="text-button danger" onClick={() => setSourceReferences((items) => items.filter((item) => item.id !== source.id))}>Remove</button></article>)}</div>}</section></div><div className="review-actions"><button className="secondary" type="button" onClick={() => { setStage('questions'); setQuestionIndex(Math.max(questions.length - 1, 0)); }}>← Back to questions</button><button className="primary" type="button" onClick={goToReview}>Review Build Contract <span>→</span></button></div></section>}

    {stage === 'review' && <section className="review-layout"><div className="review-heading"><div><p className="eyebrow">Build Contract</p><h1>Review the decisions before anything expensive happens.</h1></div><div className={blockerCount ? 'readiness warning' : 'readiness ready'}><span>{blockerCount ? 'Needs attention' : 'Ready for approval'}</span><strong>{blockerCount ? `${blockerCount} blockers` : '0 blockers'}</strong></div></div><ContractReview contract={contract} onEditQuestion={editQuestion} onEditSources={() => setStage('sources')} /><CapabilityReview contract={contract} onDecision={setCapabilityDecision} />{contract.ambiguityFollowUp.candidates.length > 0 && <section className="followup-panel"><div><span className="card-kicker">Optional ambiguity follow-up</span><h3>{contract.ambiguityFollowUp.candidates.length} high-impact answer{contract.ambiguityFollowUp.candidates.length === 1 ? '' : 's'} could benefit from clarification.</h3><p>No model has been called. A future economy-model pass is capped at {contract.ambiguityFollowUp.budget.maxTokens.toLocaleString()} tokens and {contract.ambiguityFollowUp.maxQuestions} questions.</p></div><div>{contract.ambiguityFollowUp.candidates.map((candidate) => <button key={candidate.id} className="followup-item" type="button" onClick={() => editQuestion(candidate.questionId)}><strong>{candidate.question}</strong><span>{candidate.reason} → edit</span></button>)}</div></section>}{contract.unresolvedHighImpactQuestions.length > 0 && <div className="error-box"><strong>Resolve before build:</strong> {contract.unresolvedHighImpactQuestions.join(' · ')}</div>}{contract.unresolvedCapabilityDecisions.length > 0 && <div className="error-box"><strong>Capability decision required:</strong> {contract.unresolvedCapabilityDecisions.join(' · ')}</div>}{error && <div className="error-box" role="alert">{error}</div>}<div className="review-actions"><button className="secondary" type="button" onClick={() => { setStage('questions'); setQuestionIndex(Math.max(questions.length - 1, 0)); }}>← Edit answers</button><button className="primary" type="button" onClick={approve} disabled={blockerCount > 0}>Approve Build Contract <span>→</span></button></div></section>}

    {stage === 'approved' && approvedContract && <section className="approved-layout"><div className="approved-hero"><div className="success-mark">✓</div><p className="eyebrow">Approved</p><h1>{approvedContract.customWorkModules.length ? `${approvedContract.project.name} is ready for deterministic foundation generation and planned custom work.` : `${approvedContract.project.name} is ready for deterministic generation.`}</h1><p className="lede">The requirements are now a stable v2 contract. Intake detail, buildability decisions, evidence, source references and the generated manifest can be exported as one portable bundle.</p><div className="export-row"><button className="primary" type="button" onClick={goToBuilder}>Create factory project <span>→</span></button><button className="secondary" type="button" onClick={() => downloadJson('build-contract.json', JSON.stringify(approvedContract, null, 2))}>Download contract</button><button className="secondary" type="button" onClick={() => downloadJson('project-manifest.json', JSON.stringify(manifest, null, 2))}>Download manifest</button><button className="secondary" type="button" onClick={exportBundle}>Download intake bundle <span>↓</span></button></div></div><div className="output-grid"><section className="json-card"><div className="json-title"><span>BUILD CONTRACT</span><strong>approved</strong></div><pre>{JSON.stringify(approvedContract, null, 2)}</pre></section><section className="json-card"><div className="json-title"><span>PROJECT MANIFEST</span><strong>v2</strong></div><pre>{JSON.stringify(manifest, null, 2)}</pre></section></div><section className="learning-panel"><div><span className="card-kicker">Improve the next intake</span><h3>Record anything this questionnaire got wrong or missed.</h3><p>These are evidence records only. App Builder never silently rewrites its questionnaire.</p></div><div className="learning-form"><select aria-label="Learning type" value={learningType} onChange={(event) => setLearningType(event.target.value as FeedbackType)}><option value="missing-requirement">Missing requirement</option><option value="corrected-answer">Corrected answer</option><option value="unnecessary-question">Unnecessary question</option><option value="architecture-rework">Architecture rework</option></select><textarea aria-label="Intake learning" rows={3} value={learningDetail} onChange={(event) => setLearningDetail(event.target.value)} placeholder="What should a future questionnaire know?" /><button className="secondary" type="button" onClick={addLearning}>Add evidence</button></div><div className="evidence-summary"><strong>{feedback.length}</strong><span>evidence records in this intake</span></div></section><div className="review-actions"><button className="secondary" type="button" onClick={reset}>Start another project</button><button className="text-button" type="button" onClick={() => setStage('review')}>Review contract again</button></div></section>}
  </main>;
}
