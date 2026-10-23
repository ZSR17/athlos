import { type Appearance, type StorageResponse } from '@athlos/shared';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { BodyMap } from '../components/BodyMap.tsx';
import { Icon } from '../components/Icon.tsx';
import { Progress } from '../components/Progress.tsx';
import { db } from '../db/db.ts';
import { resetColors, setAppearance, useAppearance } from '../lib/appearance.ts';
import { api, logout } from '../lib/api.ts';
import { BackupError, downloadBackup, exportData, importData } from '../lib/backup.ts';
import { onColor, tooSimilar } from '../lib/color.ts';
import { soundSettings, testBeep, useNow } from '../lib/feedback.ts';
import { formatBytes } from '../lib/format.ts';
import { type SyncState, enableSharedAppearance, syncNow, syncStatus } from '../sync/engine.ts';
import { syncSettings } from '../sync/settings.ts';

const STATUS: Record<SyncState, string> = {
  idle: 'Pas encore synchronisé',
  syncing: 'Synchronisation…',
  synced: 'Synchronisé',
  offline: 'Serveur injoignable',
  error: 'Erreur de synchronisation',
};

function ago(ts: number | null, now: number): string {
  if (!ts) return 'jamais';
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

function Toggle({ on, onChange, title, text }: { on: boolean; onChange: () => void; title: string; text: ReactNode }) {
  return (
    <button type="button" className="toggle-row" aria-pressed={on} onClick={onChange}>
      <span className="grow stack" style={{ gap: 3 }}>
        <span style={{ fontWeight: 700 }}>{title}</span>
        <span className="small muted" style={{ lineHeight: 1.4 }}>
          {text}
        </span>
      </span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}

function SoundSection() {
  const { volume } = soundSettings.use();
  return (
    <section className="stack">
      <h2 className="section-title">Bip de fin de repos</h2>
      <div className="card stack" style={{ gap: 12 }}>
        <label className="stack" style={{ gap: 8 }}>
          <span className="row between">
            <span style={{ fontWeight: 700 }}>Volume</span>
            <span className="small muted">{Math.round(volume * 100)} %</span>
          </span>
          <input
            type="range"
            className="range"
            min={10}
            max={100}
            step={10}
            value={Math.round(volume * 100)}
            onChange={(e) => soundSettings.set({ volume: Number(e.target.value) / 100 })}
          />
        </label>
        <span className="small muted" style={{ lineHeight: 1.45 }}>
          Relatif au volume de l’appareil : à 100 %, le bip est aussi fort que le volume du système.
        </span>
        <button type="button" className="btn" onClick={testBeep}>
          Tester le bip
        </button>
      </div>
    </section>
  );
}

function SyncSection() {
  const status = syncStatus.use();
  const now = useNow(15_000);
  const busy = status.state === 'syncing';
  return (
    <section className="stack">
      <h2 className="section-title">Synchronisation</h2>
      <div className="card stack">
        <div className="row">
          <span className="icon-btn" style={{ background: 'var(--surface2)', color: status.state === 'synced' ? 'var(--accent-text)' : 'var(--warn)' }} aria-hidden="true">
            <Icon name="cloud" />
          </span>
          <div className="grow stack" style={{ gap: 2 }} role="status">
            <span style={{ fontWeight: 700 }}>{STATUS[status.state]}</span>
            <span className="small muted">
              Dernière synchro {ago(status.lastSyncAt, now)}
              {status.pending > 0 ? ` · ${status.pending} modification${status.pending > 1 ? 's' : ''} en attente` : ' · rien en attente'}
            </span>
          </div>
        </div>
        {status.rejected > 0 && (
          <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>
            {status.rejected} élément{status.rejected > 1 ? 's' : ''} refusé{status.rejected > 1 ? 's' : ''} par le serveur : ils restent sur cet appareil.
          </p>
        )}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => syncNow()}>
          {busy ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
      </div>
    </section>
  );
}

interface Device {
  id: string;
  name: string;
  lastSeenAt: number;
  current: boolean;
}

function DevicesSection() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useNow(60_000);
  const load = useCallback(() => {
    api<Device[]>('/devices')
      .then((d) => {
        setDevices(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  return (
    <section className="stack">
      <h2 className="section-title">Appareils connectés</h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {failed && <p className="small muted" style={{ margin: 0, padding: 14 }}>Liste indisponible hors connexion.</p>}
        {devices?.map((d) => (
          <div key={d.id} className="toggle-row" style={{ cursor: 'default' }}>
            <span className="grow stack" style={{ gap: 2 }}>
              <span style={{ fontWeight: 700 }}>
                {d.name}
                {d.current && ' (cet appareil)'}
              </span>
              <span className="small muted">Vu {ago(d.lastSeenAt, now)}</span>
            </span>
            {!d.current && (
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                onClick={async () => {
                  if (confirm(`Déconnecter « ${d.name} » ? Il devra se reconnecter avec le mot de passe.`)) {
                    await api(`/devices/${d.id}`, { method: 'DELETE' });
                    load();
                  }
                }}
              >
                Déconnecter
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StorageSection() {
  const [server, setServer] = useState<StorageResponse | null | 'offline'>(null);
  const [device, setDevice] = useState<{ usage: number; persisted: boolean } | null>(null);
  useEffect(() => {
    api<StorageResponse>('/storage')
      .then(setServer)
      .catch(() => setServer('offline'));
    void (async () => {
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
      if (estimate?.usage !== undefined) setDevice({ usage: estimate.usage, persisted });
    })();
  }, []);

  return (
    <section className="stack">
      <h2 className="section-title">Stockage</h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="toggle-row" style={{ cursor: 'default' }}>
          <span className="grow stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 700 }}>Serveur</span>
            <span className="small muted">
              {server === null
                ? 'Calcul…'
                : server === 'offline'
                  ? 'Indisponible hors connexion'
                  : `${server.media.files} photos et vidéos · ${formatBytes(server.media.bytes)}, données ${formatBytes(server.databaseBytes)}`}
            </span>
          </span>
          {server && server !== 'offline' && (
            <span style={{ fontWeight: 700 }}>{formatBytes(server.media.bytes + server.databaseBytes)}</span>
          )}
        </div>
        <div className="toggle-row" style={{ cursor: 'default' }}>
          <span className="grow stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 700 }}>Cet appareil</span>
            <span className="small muted">
              {device === null
                ? 'Inconnu'
                : device.persisted
                  ? 'Données protégées contre l’effacement automatique'
                  : 'Le navigateur peut effacer les données s’il manque de place'}
            </span>
          </span>
          {device && <span style={{ fontWeight: 700 }}>{formatBytes(device.usage)}</span>}
        </div>
      </div>
      <span className="small muted">Les photos et vidéos qu’aucun exercice n’utilise plus sont supprimées du serveur.</span>
    </section>
  );
}

function BackupSection() {
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { imported } = await importData(JSON.parse(await f.text()));
      setMessage({ text: imported ? `${imported} élément${imported > 1 ? 's' : ''} importé${imported > 1 ? 's' : ''}, envoyé${imported > 1 ? 's' : ''} au serveur à la prochaine synchro.` : 'Rien de nouveau : tout était déjà là.' });
    } catch (err) {
      setMessage({ text: err instanceof BackupError ? err.message : 'Fichier illisible.', bad: true });
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  return (
    <section className="stack">
      <h2 className="section-title">Mes données</h2>
      <div className="card stack">
        <span className="small muted" style={{ lineHeight: 1.45 }}>
          Un fichier JSON avec tes séances, ton historique et tes exercices, à garder en lieu sûr. L’import
          ajoute ce qui manque sans rien effacer.
        </span>
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn grow" onClick={async () => downloadBackup(await exportData())}>
            Exporter
          </button>
          <button type="button" className="btn grow" onClick={() => file.current?.click()}>
            Importer
          </button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
        {message && (
          <p className="small" role="status" style={{ margin: 0, color: message.bad ? 'var(--warn)' : 'var(--accent-text)' }}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

type ColorKey = 'accent' | 'musclePrimary' | 'muscleSecondary';

const ROWS: { key: ColorKey; label: string; swatches: string[] }[] = [
  { key: 'accent', label: 'Couleur principale', swatches: ['#D4FF3A', '#7CC4FF', '#FF8A3D', '#B79CFF', '#4BE3A4', '#FF5C8A', '#F2F4F5'] },
  { key: 'musclePrimary', label: 'Muscle principal', swatches: ['#FF4D2E', '#E63946', '#FF8A3D', '#C77DFF', '#3A86FF', '#06D6A0'] },
  { key: 'muscleSecondary', label: 'Muscle secondaire', swatches: ['#FFD166', '#FFE8A3', '#9BE7FF', '#B8F2C9', '#FFB3C1', '#FF8A3D'] },
];

const THEMES: { id: Appearance['theme']; label: string }[] = [
  { id: 'dark', label: 'Sombre' },
  { id: 'light', label: 'Clair' },
  { id: 'auto', label: 'Auto' },
];

export function Settings() {
  const a = useAppearance();
  const shared = syncSettings.use().shareAppearance;
  const close = tooSimilar(a.musclePrimary, a.muscleSecondary);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="title">Réglages</h1>

      <SyncSection />

      <SoundSection />

      <section className="stack">
        <h2 className="section-title">Apparence</h2>
        <div className="seg" role="group" aria-label="Thème" style={{ background: 'var(--surface)' }}>
          {THEMES.map((t) => (
            <button key={t.id} type="button" aria-pressed={a.theme === t.id} onClick={() => setAppearance({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="card stack" style={{ gap: 16 }}>
          {ROWS.map((row) => {
            const custom = !row.swatches.includes(a[row.key].toUpperCase());
            return (
              <fieldset key={row.key} className="stack" style={{ gap: 8, border: 0, margin: 0, padding: 0 }}>
                <legend style={{ fontWeight: 700, padding: 0, marginBottom: 8 }}>{row.label}</legend>
                <div className="row wrap" style={{ gap: 8 }}>
                  {row.swatches.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="swatch"
                      style={{ background: c }}
                      aria-pressed={a[row.key].toUpperCase() === c}
                      aria-label={`${row.label} ${c}`}
                      onClick={() => setAppearance({ [row.key]: c })}
                    />
                  ))}
                  <label
                    className="swatch swatch-custom"
                    aria-pressed={custom}
                    style={custom ? { background: a[row.key], borderStyle: 'solid', borderColor: 'var(--text)' } : undefined}
                  >
                    {!custom && '+'}
                    <span className="sr-only">{row.label} : couleur personnalisée</span>
                    <input type="color" value={a[row.key]} onChange={(e) => setAppearance({ [row.key]: e.target.value.toUpperCase() })} />
                  </label>
                </div>
              </fieldset>
            );
          })}

          <div className="row" style={{ padding: 12, borderRadius: 14, background: 'var(--bg)' }}>
            <div className="grow stack" style={{ gap: 8 }}>
              <span className="label">Aperçu</span>
              <span
                className="btn"
                style={{ background: a.accent, color: onColor(a.accent), borderColor: a.accent, minHeight: 42 }}
              >
                Valider la série
              </span>
            </div>
            <BodyMap
              primary={['quads']}
              secondary={['glutes', 'hamstrings', 'calves', 'lowerback']}
              height={92}
              legend={false}
              colors={{ primary: a.musclePrimary, secondary: a.muscleSecondary }}
            />
          </div>
          {close && (
            <p className="small" role="status" style={{ margin: 0, color: 'var(--warn)', lineHeight: 1.45 }}>
              Les couleurs principal et secondaire se ressemblent : elles seront difficiles à distinguer sur la silhouette.
            </p>
          )}
          <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start', color: 'var(--muted)' }} onClick={resetColors}>
            Rétablir les couleurs par défaut
          </button>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <Toggle
            on={shared}
            onChange={() => (shared ? syncSettings.set({ shareAppearance: false }) : void enableSharedAppearance())}
            title="Mêmes couleurs sur tous mes appareils"
            text={
              shared
                ? 'Activé : les appareils où l’option est cochée partagent ces couleurs.'
                : 'Désactivé : cet appareil garde ses propres couleurs.'
            }
          />
        </div>
      </section>

      <StorageSection />

      <BackupSection />

      <DevicesSection />

      <section className="stack">
        <h2 className="section-title">Compte</h2>
        <button type="button" className="btn" onClick={() => logout()}>
          Se déconnecter de cet appareil
        </button>
      </section>

      <section className="stack small muted" style={{ gap: 4 }}>
        <h2 className="section-title">À propos</h2>
        <span>Exercices et photos : free-exercise-db (domaine public).</span>
        <span>Silhouette anatomique : react-native-body-highlighter (licence MIT).</span>
      </section>
    </div>
  );
}
