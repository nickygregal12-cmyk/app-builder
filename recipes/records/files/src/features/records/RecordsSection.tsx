import { useState, type FormEvent } from 'react';
import { useRecords, type RecordStatus, type TenantRecord } from './RecordsContext';

/**
 * The records surface of a generated application.
 *
 * Deliberately plain. This slice exists to prove that a generated product can
 * hold organisation-owned data safely, not to advance the visual system, and
 * the presentation debt recorded against Phase 4D is not paid by decorating a
 * CRUD table. It uses the shell's existing primitives — `.button`,
 * `.primary-action`, `.content-card` — and adds no new design vocabulary.
 *
 * What it does take seriously is telling the truth about state. A list that
 * renders identically while loading, while empty, and while failing is a list
 * that has taught its user to distrust it.
 */

const STATUSES: readonly RecordStatus[] = ['draft', 'active'];

function RecordForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: Partial<TenantRecord>;
  submitLabel: string;
  onSubmit(values: { reference: string; title: string; summary: string; status: RecordStatus }): Promise<void>;
  onCancel?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setFailure(null);
    try {
      await onSubmit({
        reference: String(data.get('reference') ?? ''),
        title: String(data.get('title') ?? ''),
        summary: String(data.get('summary') ?? ''),
        // An archived record is not reachable from this form: archiving is the
        // privileged operation and has its own control.
        status: (String(data.get('status') ?? 'draft') as RecordStatus),
      });
      // Only a write that succeeded may clear what someone typed.
      if (!initial) form.reset();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'The record could not be saved.');
    } finally {
      setPending(false);
    }
  }

  return <form className="record-form" onSubmit={submit}>
    <label>Reference <input name="reference" defaultValue={initial?.reference ?? ''} required pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,63}" /></label>
    <label>Title <input name="title" defaultValue={initial?.title ?? ''} required maxLength={200} /></label>
    <label className="span-two">Summary <textarea name="summary" defaultValue={initial?.summary ?? ''} rows={3} maxLength={2000} /></label>
    <label>Status <select name="status" defaultValue={initial?.status === 'archived' ? 'draft' : (initial?.status ?? 'draft')}>
      {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <div className="record-form-actions">
      <button className="button primary-action" type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
      {onCancel && <button className="button secondary-action" type="button" onClick={onCancel}>Cancel</button>}
      {failure && <p className="record-status record-status-failed" role="alert">{failure}</p>}
    </div>
  </form>;
}

function RecordRow({ record }: { record: TenantRecord }) {
  const { permissions, update, remove, setArchived } = useRecords();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setFailure(null);
    try { await action(); } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That action did not complete.');
    } finally { setBusy(false); }
  }

  return <article className="content-card record-card" data-record-reference={record.reference} data-record-status={record.status}>
    <header className="record-card-header">
      <h3>{record.title}</h3>
      <p className="record-reference">{record.reference}</p>
      <p className={`record-badge record-badge-${record.status}`}>{record.status}</p>
    </header>
    {record.summary && <p className="record-summary">{record.summary}</p>}

    {editing
      ? <RecordForm
        initial={record}
        submitLabel="Save changes"
        onCancel={() => setEditing(false)}
        onSubmit={async (values) => { await update(record.id, values); setEditing(false); }}
      />
      : <div className="record-actions">
        {permissions.canEdit && <button className="button secondary-action" type="button" onClick={() => setEditing(true)}>Edit</button>}
        {permissions.canArchive && <button
          className="button secondary-action"
          type="button"
          disabled={busy}
          onClick={() => run(() => setArchived(record.id, record.status !== 'archived'))}
        >{record.status === 'archived' ? 'Restore' : 'Archive'}</button>}
        {permissions.canDelete && <button
          className="button secondary-action"
          type="button"
          disabled={busy}
          onClick={() => run(() => remove(record.id))}
        >Delete</button>}
      </div>}

    {failure && <p className="record-status record-status-failed" role="alert">{failure}</p>}
  </article>;
}

export function RecordsSection() {
  const { organisation, records, loading, error, permissions, create } = useRecords();

  // No organisation is a real state and not an error. Someone signed in who has
  // not yet joined one should be told what to do, not shown an empty table.
  if (!organisation) {
    return <div className="records-panel">
      <p className="record-empty">You are not a member of an organisation yet. Create one to start keeping records.</p>
    </div>;
  }

  return <div className="records-panel" data-organisation-id={organisation.id}>
    {/* The organisation someone is working in, named. Its id is an attribute
        for tests rather than something a person is asked to read, and no role,
        membership internals or build metadata are exposed. */}
    <p className="records-context">Records for <strong>{organisation.name}</strong></p>

    {permissions.canCreate
      ? <RecordForm submitLabel="Add record" onSubmit={async (values) => { await create(values); }} />
      : <p className="record-readonly">Your role in this organisation can view records but not change them.</p>}

    {loading && <p className="record-loading" aria-live="polite">Loading records…</p>}
    {error && <p className="record-status record-status-failed" role="alert">{error}</p>}

    {!loading && !error && records.length === 0 && <p className="record-empty">No records yet.</p>}

    {records.length > 0 && <div className="record-list">
      {records.map((record) => <RecordRow key={record.id} record={record} />)}
    </div>}
  </div>;
}
