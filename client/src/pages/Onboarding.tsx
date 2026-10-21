import { Icon, type IconName } from '../components/Icon.tsx';
import { describeMode, syncSettings } from '../sync/settings.ts';

function Choice({
  icon,
  title,
  text,
  on,
  onToggle,
}: {
  icon: IconName;
  title: string;
  text: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="card row"
      aria-pressed={on}
      onClick={onToggle}
      style={{ alignItems: 'flex-start', textAlign: 'left', border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`, cursor: 'pointer', gap: 14, padding: 16 }}
    >
      <span className="icon-btn" style={{ background: 'var(--surface2)', color: 'var(--accent-text)', width: 40, height: 40 }} aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span className="grow stack" style={{ gap: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
        <span className="small muted" style={{ lineHeight: 1.45 }}>
          {text}
        </span>
      </span>
      <span className={`check${on ? ' on' : ''}`} aria-hidden="true">
        {on && <Icon name="check" size={16} strokeWidth={3} />}
      </span>
    </button>
  );
}

// First launch: how should this device sync? Both options can be changed later in the settings.
export function Onboarding() {
  const s = syncSettings.use();
  const mode = describeMode(s);
  return (
    <div className="page" style={{ maxWidth: 520, minHeight: '100dvh', justifyContent: 'center' }}>
      <span className="small muted" style={{ fontWeight: 600 }}>
        Dernière étape
      </span>
      <h1 className="title">Comment synchroniser avec ton serveur ?</h1>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
        L'app fonctionne toujours sans réseau. Ces réglages décident seulement <strong style={{ color: 'var(--text)' }}>quand</strong> elle
        envoie tes données au serveur. Tu pourras les changer dans Réglages.
      </p>
      <Choice
        icon="wifi"
        title="Uniquement en Wi-Fi maison"
        text="Rien n'est envoyé en données mobiles (4G/5G). Zéro data consommée."
        on={s.wifiOnly}
        onToggle={() => syncSettings.set({ wifiOnly: !s.wifiOnly })}
      />
      <Choice
        icon="flag"
        title="Seulement à la fin de la séance"
        text="Pendant l'entraînement, aucun échange. Tout part quand tu appuies sur « Terminer »."
        on={s.endOnly}
        onToggle={() => syncSettings.set({ endOnly: !s.endOnly })}
      />
      <div className="card stack" style={{ gap: 6, border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' }} role="status">
        <span className="section-title" style={{ color: 'var(--accent-text)' }}>
          Résultat
        </span>
        <span style={{ fontWeight: 700 }}>{mode.title}</span>
        <span className="small muted" style={{ lineHeight: 1.45 }}>
          {mode.text}
        </span>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => syncSettings.set({ onboarded: true })}>
        Continuer
      </button>
    </div>
  );
}
