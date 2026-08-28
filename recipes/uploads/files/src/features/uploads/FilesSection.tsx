import { useRef, useState, type ChangeEvent } from 'react';
import './uploads.css';
import { ACCEPTED_TYPES, useOrganisationFiles, type OrganisationFile } from './FilesContext';

/**
 * The files surface of a generated application.
 *
 * Plain by intent, like the records surface beside it. This slice proves an
 * organisation can accept, retain and protect a file; it is not an attempt at
 * the visual system, and it adds no design vocabulary of its own.
 *
 * What it does refuse to do is show its own plumbing. A person sees the name
 * they uploaded, its size and when it arrived. The storage key, the bucket and
 * the object uuid exist in evidence and in the network tab; they are not the
 * product.
 */

function humanSize(bytes: number | null) {
  if (bytes === null) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function humanDate(value: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString();
}

function FileRow({ file }: { file: OrganisationFile }) {
  const { permissions, remove, openUrl } = useOrganisationFiles();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setFailure(null);
    try {
      const url = await openUrl(file.key);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That file could not be opened.');
    } finally { setBusy(false); }
  }

  async function discard() {
    setBusy(true);
    setFailure(null);
    try { await remove(file.key); } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That file could not be removed.');
    } finally { setBusy(false); }
  }

  return <li className="content-card file-card" data-file-name={file.name}>
    <div className="file-identity">
      <p className="file-name">{file.name}</p>
      <p className="file-meta">{humanSize(file.sizeBytes)}{humanDate(file.uploadedAt) ? ` · ${humanDate(file.uploadedAt)}` : ''}</p>
    </div>
    <div className="file-actions">
      <button className="button secondary-action" type="button" disabled={busy} onClick={open}>Open</button>
      {permissions.canDelete && <button className="button secondary-action" type="button" disabled={busy} onClick={discard}>Remove</button>}
    </div>
    {failure && <p className="file-status file-status-failed" role="alert">{failure}</p>}
  </li>;
}

export function FilesSection() {
  const { organisation, files, loading, error, permissions, upload } = useOrganisationFiles();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setFailure(null);
    setNote(null);
    try {
      await upload(file);
      setNote(`${file.name} uploaded.`);
    } catch (uploadError) {
      setFailure(uploadError instanceof Error ? uploadError.message : 'That file could not be uploaded.');
    } finally {
      setBusy(false);
      // Clearing lets the same file be chosen again after a failure.
      if (input.current) input.current.value = '';
    }
  }

  if (!organisation) {
    return <div className="files-panel">
      <p className="file-empty">You are not a member of an organisation yet. Create one to keep files.</p>
    </div>;
  }

  return <div className="files-panel" data-organisation-id={organisation.id}>
    <p className="files-context">Files for <strong>{organisation.name}</strong></p>

    {permissions.canUpload
      ? <div className="file-upload">
        {/* A plain labelled file input, and deliberately so. The usual trick —
            a styled label over a visually hidden input — needs CSS to be usable
            at all, and if that CSS ever fails to load the one control this
            capability depends on becomes invisible. The browser's own control
            is keyboard reachable, announced, and understood by everybody. */}
        <label className="file-upload-label" htmlFor="organisation-file-input">
          Add a file
          <input
            id="organisation-file-input"
            ref={input}
            type="file"
            accept={Object.keys(ACCEPTED_TYPES).join(',')}
            disabled={busy}
            onChange={choose}
          />
        </label>
        <p className="file-hint" id="organisation-file-hint">Up to 10 MB. {Object.values(ACCEPTED_TYPES).join(', ')}.</p>
      </div>
      : <p className="file-readonly">Your role in this organisation can open files but not add or remove them.</p>}

    {busy && <p className="file-loading" aria-live="polite">Uploading…</p>}
    {note && <p className="file-status file-status-ok" aria-live="polite">{note}</p>}
    {failure && <p className="file-status file-status-failed" role="alert">{failure}</p>}

    {loading && <p className="file-loading" aria-live="polite">Loading files…</p>}
    {error && <p className="file-status file-status-failed" role="alert">{error}</p>}

    {!loading && !error && files.length === 0 && <p className="file-empty">No files yet.</p>}

    {files.length > 0 && <ul className="file-list">
      {files.map((file) => <FileRow key={file.key} file={file} />)}
    </ul>}
  </div>;
}
