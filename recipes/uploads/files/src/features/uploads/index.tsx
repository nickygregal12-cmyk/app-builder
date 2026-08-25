import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../../platform/supabase/client';

export const recipe = { id: 'uploads', label: 'Private user uploads' };
const BUCKET = 'user-files';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function safeName(name: string) {
  const cleaned = name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 120) || 'file';
}

export async function uploadUserFile(userId: string, file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Files must be 10 MB or smaller.');
  const path = `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return data.path;
}

export async function listUserFiles(userId: string) {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return data;
}

export async function deleteUserFile(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function UserFileUpload() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const input = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try { const path = await uploadUserFile(user.id, file); setMessage(`Uploaded ${path}`); event.currentTarget.reset(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.'); }
  }
  return <form onSubmit={submit}><label>Choose file <input name="file" type="file" required /></label><button type="submit">Upload</button><p aria-live="polite">{message}</p></form>;
}
