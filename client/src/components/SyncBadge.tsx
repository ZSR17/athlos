import { Link } from 'react-router-dom';
import { type SyncState, syncStatus } from '../sync/engine.ts';

const LABELS: Record<SyncState, string> = {
  idle: 'Synchro…',
  syncing: 'Synchronisation…',
  synced: 'Synchronisé',
  offline: 'Hors-ligne',
  error: 'Erreur de synchro',
};

const TONE: Record<SyncState, 'ok' | 'wait' | 'bad'> = {
  idle: 'wait',
  syncing: 'wait',
  synced: 'ok',
  offline: 'wait',
  error: 'bad',
};

// Short labels for cramped headers (live session in a narrow window).
const SHORT: Record<SyncState, string> = {
  idle: 'Synchro',
  syncing: 'Synchro…',
  synced: 'Synchro',
  offline: 'Hors-ligne',
  error: 'Erreur',
};

export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const { state, pending, download } = syncStatus.use();
  const showPending = pending > 0 && state !== 'syncing' && state !== 'synced';
  const pct = download && download.total ? Math.round((download.done / download.total) * 100) : null;
  const label = pct !== null ? `Téléchargement ${pct} %` : LABELS[state] + (showPending ? ` · ${pending} en attente` : '');
  return (
    <Link to="/reglages" className={`sync-badge ${TONE[state]}`} aria-label={`Synchronisation : ${label}`}>
      <span className="dot" aria-hidden="true" />
      {compact ? (pct !== null ? `${pct} %` : SHORT[state] + (showPending ? ` · ${pending}` : '')) : label}
    </Link>
  );
}
