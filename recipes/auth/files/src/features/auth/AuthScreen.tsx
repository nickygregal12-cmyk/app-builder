import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';
import './auth.css';

type Mode = 'sign-in' | 'sign-up';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'sign-in') await signIn(email, password);
      else {
        await signUp(email, password);
        setMessage('Account created. Check your email if confirmation is enabled.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <p className="auth-kicker">Secure access</p>
      <h1>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h1>
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
      </form>
      <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); }}>
        {mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
      </button>
    </section>
  </main>;
}
