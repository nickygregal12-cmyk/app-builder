import { useEffect, useState, type FormEvent } from 'react';
import { useProfile } from './ProfileContext';

export function ProfileSettings() {
  const { profile, loading, save } = useProfile();
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setDisplayName(profile?.display_name ?? ''), [profile]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save({ display_name: displayName.trim() || null, avatar_url: profile?.avatar_url ?? null });
      setMessage('Profile saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save profile.');
    }
  }

  return <form onSubmit={submit}>
    <label>Display name<input value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} /></label>
    <button type="submit" disabled={loading}>Save profile</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
