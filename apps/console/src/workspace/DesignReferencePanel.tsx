import { useState } from 'react';
import {
  addDesignReference,
  designReferenceCaptureUrl,
  readDesignReferences,
  removeDesignReference,
  setDesignReferenceApproval,
  updateDesignReferenceIntent,
  type DesignReference,
  type DesignReferenceState,
} from '../service/client';

/**
 * "Sites you like."
 *
 * The whole design problem of this panel is that the person using it is not a
 * designer. They know they like a site; they do not know the word for what they
 * like about it. So the shortest path through here is a URL and a sentence:
 *
 *   paste a link -> "what do you like about it?" -> the factory captures it ->
 *   "Use: typography, spacing, motion. Avoid: dark palette." -> approve
 *
 * Everything else — which parts of the design a reference may speak to, how
 * strongly it should count, which individual traits to keep — is available and
 * optional, and none of it has to be touched for the flow to work.
 *
 * Two things are shown that a prettier panel would hide, because hiding them is
 * how a design tool starts lying. The first is where a trait came from: measured
 * from the page, taken from what you wrote, or both. The second is a trait the
 * factory cannot act on — "avoid the dark palette" is heard, recorded, and says
 * so, rather than appearing in a list that implies it changed the build.
 */

const PREFERENCES: Array<{ id: 'like' | 'dislike' | 'mixed'; label: string; hint: string }> = [
  { id: 'like', label: 'I like this', hint: 'Steer towards what this site does.' },
  { id: 'mixed', label: 'Parts of it', hint: 'Some of it. Say which below, or just write it.' },
  { id: 'dislike', label: 'Not like this', hint: 'Steer away from what this site does.' },
];

const INFLUENCES: Array<{ id: 'low' | 'medium' | 'strong'; label: string }> = [
  { id: 'low', label: 'A hint' },
  { id: 'medium', label: 'Some' },
  { id: 'strong', label: 'A lot' },
];

const SOURCE_LABELS: Record<string, string> = {
  observed: 'measured on the page',
  'user-stated': 'you said so',
  'observed-and-user-stated': 'measured, and you said so',
};

function words(value: string) {
  return value.replaceAll('-', ' ');
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function TraitList({ traits, intent }: { traits: DesignReference['adopt']; intent: 'Use' | 'Avoid' }) {
  if (!traits.length) return <p className="builder-empty">Nothing yet.</p>;
  return <ul className="reference-traits">
    {traits.map((trait) => <li key={trait.trait} className={trait.consumer ? '' : 'reference-trait-unused'}>
      <strong>{trait.label ?? words(trait.trait)}</strong>
      <span className="reference-trait-meta">{words(trait.useFor)} · {SOURCE_LABELS[trait.source] ?? trait.source} · {trait.confidence} confidence</span>
      {trait.detail && <span className="reference-trait-detail">{trait.detail}</span>}
      {!trait.consumer && <span className="reference-trait-detail">
        {intent === 'Avoid' ? 'Recorded, and nothing to change: ' : 'Recorded, and cannot be applied: '}{trait.consumerAbsentReason}
      </span>}
    </li>)}
  </ul>;
}

function ReferenceCard({ projectId, reference, useForOptions, disabled, onChanged, onError }: {
  projectId: string;
  reference: DesignReference;
  useForOptions: string[];
  disabled: boolean;
  onChanged: (state: DesignReferenceState) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const capture = reference.capture?.viewports.find((viewport) => viewport.name === 'desktop') ?? reference.capture?.viewports[0] ?? null;
  const thumbnail = capture?.file ?? reference.sourceRef.fileName;

  async function act(work: () => Promise<DesignReferenceState>) {
    setBusy(true);
    onError('');
    try {
      onChanged(await work());
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const toggleUseFor = (part: string) => {
    const current = new Set(reference.userIntent.useFor);
    if (current.has(part)) current.delete(part); else current.add(part);
    return act(() => updateDesignReferenceIntent(projectId, reference.referenceId, { useFor: [...current] }));
  };

  return <article className={`reference-card reference-${reference.approval.state}`}>
    <header>
      <strong>{reference.sourceRef.label}</strong>
      <span className={`reference-state state-${reference.approval.state}`}>{reference.approval.state}</span>
    </header>
    {reference.sourceRef.canonicalUrl && <p className="reference-url"><code>{reference.sourceRef.canonicalUrl}</code></p>}

    {thumbnail
      ? <div className="reference-shot" tabIndex={0} role="group" aria-label={`${reference.sourceRef.label} — captured page`}>
        <img src={designReferenceCaptureUrl(projectId, reference.referenceId, thumbnail)} alt={`${reference.sourceRef.label}, as captured`} loading="lazy" />
      </div>
      : <p className="builder-empty">No capture. {reference.capture?.unavailableReason ?? 'This reference rests on what you wrote about it.'}</p>}

    {!reference.createdFromEvidence && <p className="builder-empty">
      Nothing here was measured. Every trait below came from what you said, which is a legitimate input and is not the same as an observation.
    </p>}

    {reference.userIntent.note && <p className="reference-note">“{reference.userIntent.note}”</p>}
    {reference.userIntent.readFromNote.length > 0 && <p className="builder-empty">
      Read as: {reference.userIntent.readFromNote.map((entry) => `${entry.polarity === 'like' ? '' : 'not '}${words(entry.trait)} (from “${entry.phrase}”)`).join(', ')}. Correct it by editing what this is used for, below.
    </p>}

    <div className="reference-columns">
      <div>
        <strong>Use</strong>
        <TraitList traits={reference.adopt} intent="Use" />
      </div>
      <div>
        <strong>Avoid</strong>
        <TraitList traits={reference.avoid} intent="Avoid" />
      </div>
    </div>

    <fieldset className="reference-usefor" disabled={disabled || busy}>
      <legend>Which parts of the design should this influence?</legend>
      <p className="builder-empty">Leave all of them off to let it speak to everything it showed.</p>
      <div className="reference-chips">
        {useForOptions.map((part) => <button
          type="button"
          key={part}
          className={reference.userIntent.useFor.includes(part) ? 'active' : ''}
          aria-pressed={reference.userIntent.useFor.includes(part)}
          onClick={() => toggleUseFor(part)}
        >{words(part)}</button>)}
      </div>
    </fieldset>

    <details className="reference-observations">
      <summary>What the browser measured</summary>
      <dl className="builder-definition">
        {Object.entries(reference.observed).flatMap(([category, entries]) => entries.map((entry) => <div key={entry.id}>
          <dt>{words(category)} · {words(entry.measure)}</dt>
          <dd>{String(entry.value)}{entry.unit ? entry.unit : ''}{entry.viewport ? ` (${entry.viewport})` : ''}</dd>
        </div>))}
      </dl>
      <p className="builder-empty">Measurements only. No text, markup, stylesheet or image from the source is kept, and a supplied reference never becomes publishable material.</p>
    </details>

    <div className="reference-actions">
      {reference.approval.state !== 'approved'
        ? <button type="button" className="secondary compact" disabled={disabled || busy || (!reference.adopt.length && !reference.avoid.length)} onClick={() => act(() => setDesignReferenceApproval(projectId, reference.referenceId, 'approved'))}>
          Approve these traits
        </button>
        : <button type="button" className="secondary compact" disabled={disabled || busy} onClick={() => act(() => setDesignReferenceApproval(projectId, reference.referenceId, 'disabled'))}>
          Stop using this
        </button>}
      <button type="button" className="secondary compact" disabled={disabled || busy} onClick={() => act(() => removeDesignReference(projectId, reference.referenceId))}>Remove</button>
    </div>
  </article>;
}

export function DesignReferencePanel({ projectId, state, disabled, onChanged, onError }: {
  projectId: string;
  state: DesignReferenceState;
  disabled: boolean;
  onChanged: (state: DesignReferenceState) => void;
  onError: (message: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [preference, setPreference] = useState<'like' | 'dislike' | 'mixed'>('like');
  const [influence, setInfluence] = useState<'low' | 'medium' | 'strong'>('medium');
  const [busy, setBusy] = useState(false);

  const full = state.references.length >= state.limits.maxReferencesPerProject;

  async function add(request: Parameters<typeof addDesignReference>[1]) {
    setBusy(true);
    onError('');
    try {
      await addDesignReference(projectId, request);
      onChanged(await readDesignReferences(projectId));
      setUrl('');
      setNote('');
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addUrl() {
    if (!url.trim()) return;
    await add({ url: url.trim(), preference, influence, useFor: [], note: note.trim() || null });
  }

  async function addScreenshot(file: File) {
    await add({
      contentBase64: await fileToBase64(file),
      mimeType: file.type || 'image/png',
      label: file.name,
      preference,
      influence,
      useFor: [],
      note: note.trim() || null,
    });
  }

  const { influence: resolved } = state;

  return <section className="builder-panel reference-panel" aria-label="Design inspiration">
    <div className="panel-title-row">
      <span className="builder-kicker">Design inspiration</span>
      <span>{state.references.length ? `${state.references.filter((reference) => reference.approval.state === 'approved').length} of ${state.references.length} in use` : 'none yet'}</span>
    </div>
    <p className="builder-empty">
      Sites and pictures you like. The factory looks at them, works out what makes them look the way they do, and uses that as
      influence — never as a template. Nothing from a reference is copied into your site, and nothing it says becomes a fact about your business.
    </p>

    <div className="reference-add">
      <label>
        <span>A site you like</span>
        <input
          type="url"
          value={url}
          placeholder="https://…"
          disabled={disabled || busy || full}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label>
        <span>What do you like about it?</span>
        <textarea
          rows={2}
          value={note}
          placeholder="In your own words. “Love the big type and the spacing, but not the dark colours.”"
          disabled={disabled || busy || full}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <fieldset className="reference-chips-field" disabled={disabled || busy || full}>
        <legend>How do you feel about it?</legend>
        <div className="reference-chips">
          {PREFERENCES.map((entry) => <button type="button" key={entry.id} className={preference === entry.id ? 'active' : ''} aria-pressed={preference === entry.id} title={entry.hint} onClick={() => setPreference(entry.id)}>{entry.label}</button>)}
        </div>
      </fieldset>
      <fieldset className="reference-chips-field" disabled={disabled || busy || full}>
        <legend>How much should it count?</legend>
        <div className="reference-chips">
          {INFLUENCES.map((entry) => <button type="button" key={entry.id} className={influence === entry.id ? 'active' : ''} aria-pressed={influence === entry.id} onClick={() => setInfluence(entry.id)}>{entry.label}</button>)}
        </div>
      </fieldset>

      <div className="reference-actions">
        <button type="button" className="secondary compact" disabled={disabled || busy || full || !url.trim()} onClick={addUrl}>
          {busy ? 'Looking at it…' : 'Add this site'}
        </button>
        <label className="reference-upload">
          <span>{busy ? 'Adding…' : 'Or add a screenshot'}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || busy || full}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void addScreenshot(file);
            }}
          />
        </label>
      </div>
      {full && <p className="builder-empty">That is as many references as one project carries. Remove one to add another.</p>}
    </div>

    {resolved.conflicts.length > 0 && <div className="evidence-uncovered">
      <strong>{resolved.conflicts.length} thing{resolved.conflicts.length === 1 ? '' : 's'} your references disagree about</strong>
      {resolved.conflicts.map((conflict) => <span key={`${conflict.axis}-${conflict.detail}`}>
        {conflict.resolution === 'unresolved' ? 'Unresolved — ' : ''}{conflict.detail}
      </span>)}
    </div>}

    {resolved.influenced && <dl className="builder-definition reference-influence">
      {Object.entries(resolved.prefer).map(([axis, value]) => <div key={axis}><dt>{words(axis)}</dt><dd>{words(value)}</dd></div>)}
      {Object.entries(resolved.refuse).map(([axis, values]) => <div key={`no-${axis}`}><dt>not {words(axis)}</dt><dd>{values.map(words).join(', ')}</dd></div>)}
    </dl>}

    {state.references.map((reference) => <ReferenceCard
      key={reference.referenceId}
      projectId={projectId}
      reference={reference}
      useForOptions={state.useFor}
      disabled={disabled}
      onChanged={onChanged}
      onError={onError}
    />)}
  </section>;
}
