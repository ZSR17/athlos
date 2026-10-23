import { type FormEvent, useState } from 'react';
import { ApiError, guessDeviceName, login } from '../lib/api.ts';

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState(guessDeviceName());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password, deviceName.trim() || guessDeviceName());
      onLoggedIn();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? 'Mot de passe incorrect.'
            : err.status === 429
              ? 'Trop de tentatives, réessaie dans une minute.'
              : 'Le serveur a refusé la connexion.'
          : "Impossible de joindre le serveur. Vérifie ta connexion.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 420, minHeight: '100dvh', justifyContent: 'center' }}>
      <span className="title" style={{ color: 'var(--accent-text)' }}>
        Athlos
      </span>
      <h1 className="title-sm">Connexion au serveur</h1>
      <form className="stack" onSubmit={submit}>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Mot de passe</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Nom de cet appareil</span>
          <input className="input" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={80} />
        </label>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !password}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
