import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useOrganisations, type Organisation, type OrganisationRole } from '../organisations';
import { supabase } from '../../platform/supabase/client';

/**
 * The files an organisation owns.
 *
 * The bucket is private and every policy on it re-derives the owning
 * organisation from the object's own key, so the tenant filter below selects
 * what the person is *looking at* rather than what they are *allowed* to see.
 * If this component filtered wrongly a colleague would see the wrong list; only
 * the storage policies decide whether another tenant's files are reachable, and
 * they are proved separately against a real Storage service.
 */

export const BUCKET = 'organisation-files';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * What a person may upload.
 *
 * A deliberately small list. An organisation file store that accepts anything
 * becomes a malware relay, and "allow everything and scan later" is not a first
 * slice. Checked in the browser for a useful message and bounded again by the
 * bucket's own size limit, which the client cannot talk its way past.
 */
export const ACCEPTED_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

export type OrganisationFile = {
  /** The storage key, relative to the organisation prefix. Never shown to a person. */
  key: string;
  /** The name the uploader's own file had. */
  name: string;
  sizeBytes: number | null;
  uploadedAt: string | null;
};

export const CONTRIBUTOR_ROLES: readonly OrganisationRole[] = ['owner', 'admin', 'editor', 'member'];
export const FILE_ADMIN_ROLES: readonly OrganisationRole[] = ['owner', 'admin'];

export function filePermissions(role: OrganisationRole | null) {
  return {
    canRead: role !== null,
    canUpload: role !== null && CONTRIBUTOR_ROLES.includes(role),
    canDelete: role !== null && FILE_ADMIN_ROLES.includes(role),
  };
}

/**
 * The uuid the key starts with is 36 characters plus its separating hyphen, so
 * everything after it is the name the person recognises. A key that does not
 * follow the scheme falls back to itself rather than being hidden: an object
 * nobody can name is still an object taking up the organisation's space.
 */
const KEY_PREFIX_LENGTH = 37;
export function displayName(key: string) {
  return key.length > KEY_PREFIX_LENGTH ? key.slice(KEY_PREFIX_LENGTH) : key;
}

function safeName(name: string) {
  const cleaned = name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 120) || 'file';
}

type FilesContextValue = {
  organisation: Organisation | null;
  files: OrganisationFile[];
  loading: boolean;
  error: string | null;
  permissions: ReturnType<typeof filePermissions>;
  refresh(): Promise<void>;
  upload(file: File): Promise<void>;
  remove(key: string): Promise<void>;
  openUrl(key: string): Promise<string>;
};

const FilesContext = createContext<FilesContextValue | null>(null);

export function FilesProvider({ children }: PropsWithChildren) {
  const { organisations } = useOrganisations();
  const [files, setFiles] = useState<OrganisationFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const organisation = organisations[0] ?? null;

  const refresh = useCallback(async () => {
    if (!organisation) { setFiles([]); return; }
    setLoading(true);
    setError(null);
    const { data, error: listError } = await supabase.storage.from(BUCKET).list(organisation.id, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    setLoading(false);
    if (listError) { setError(listError.message); setFiles([]); return; }
    setFiles((data ?? [])
      // Supabase returns a placeholder row for an empty prefix; it is not a file.
      .filter((entry) => entry.name && entry.id !== null)
      .map((entry) => ({
        key: entry.name,
        name: displayName(entry.name),
        sizeBytes: typeof entry.metadata?.size === 'number' ? entry.metadata.size : null,
        uploadedAt: entry.created_at ?? null,
      })));
  }, [organisation]);

  useEffect(() => { void refresh(); }, [refresh]);

  const permissions = useMemo(() => filePermissions(organisation?.role ?? null), [organisation]);

  const value = useMemo<FilesContextValue>(() => ({
    organisation,
    files,
    loading,
    error,
    permissions,
    refresh,
    async upload(file) {
      if (!organisation) throw new Error('Join an organisation before uploading files.');
      // Client-side checks so a person gets a sentence rather than a rejected
      // request. Neither is the boundary: the bucket enforces its own size
      // limit and the policies enforce the tenant.
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`Files must be ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB or smaller. That one is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      }
      if (!Object.hasOwn(ACCEPTED_TYPES, file.type)) {
        throw new Error(`That file type is not accepted here. Try ${Object.values(ACCEPTED_TYPES).join(', ')}.`);
      }
      const key = `${organisation.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(key, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      await refresh();
    },
    async remove(key) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([`${organisation?.id}/${key}`]);
      if (removeError) throw removeError;
      await refresh();
    },
    async openUrl(key) {
      // A signed, expiring URL. The bucket is private, so there is no public
      // address to hand out and none is invented.
      const { data, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(`${organisation?.id}/${key}`, 60);
      if (signError) throw signError;
      return data.signedUrl;
    },
  }), [error, files, loading, organisation, permissions, refresh]);

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>;
}

export function useOrganisationFiles() {
  const context = useContext(FilesContext);
  if (!context) throw new Error('useOrganisationFiles must be used inside FilesProvider.');
  return context;
}
