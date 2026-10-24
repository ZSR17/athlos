import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { ValueInput } from '../components/ValueInput.tsx';
import { formatKg, parseCount, parseKg } from '../lib/format.ts';
import { type Load, type Plate, type PlateResult, loadPlates, plateSettings } from '../lib/plates.ts';

const kg = (g: number) => `${formatKg(g)} kg`;
const formatPlate = (g: number | undefined) => formatKg(g || undefined);
const formatCount = (n: number | undefined) => String(n ?? 0);

function LoadCard({ load, onUse }: { load: Load; onUse?: () => void }) {
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row between">
        <span className="stack" style={{ gap: 2 }}>
          <span className="title-sm">{kg(load.perSideG)} de chaque côté</span>
          <span className="small muted">{kg(load.totalG)} au total, barre comprise</span>
        </span>
        {onUse && (
          <button type="button" className="btn btn-ghost" onClick={onUse}>
            Choisir
          </button>
        )}
      </div>
      {load.perSide.length ? (
        <ul className="plate-list">
          {load.perSide.map((p) => (
            <li key={p.weightG}>
              <span className="plate-count">{p.count} ×</span> disque de {kg(p.weightG)}
            </li>
          ))}
        </ul>
      ) : (
        <span className="muted">La barre seule, rien à ajouter.</span>
      )}
    </div>
  );
}

function Result({ result, targetG, onUse }: { result: PlateResult; targetG: number; onUse: (g: number) => void }) {
  if (result.exact) return <LoadCard load={result.load} />;
  return (
    <div className="stack">
      <div className="card notice-warn">
        Impossible de faire {kg(targetG)} avec tes disques. Voici le plus proche :
      </div>
      <LoadCard load={result.below} onUse={() => onUse(result.below.totalG)} />
      {result.above ? (
        <LoadCard load={result.above} onUse={() => onUse(result.above!.totalG)} />
      ) : (
        <span className="small muted">Tu n’as pas assez de disques pour monter au-dessus.</span>
      )}
    </div>
  );
}

function answer(barG: number, targetG: number, plates: Plate[]): { error: string } | { result: PlateResult } {
  if (targetG < barG) return { error: 'Le poids voulu est plus léger que la barre.' };
  if (targetG > barG && !plates.some((p) => p.weightG > 0 && p.count >= 2))
    return { error: 'Ajoute d’abord tes disques, au moins deux de chaque poids (un de chaque côté).' };
  return { result: loadPlates(barG, targetG, plates) };
}

export function Plates() {
  const { barG, plates, targetG } = plateSettings.use();
  const [params, setParams] = useSearchParams();

  // Opened from the 1RM calculator with a weight (in grams).
  useEffect(() => {
    const weight = Number(params.get('poids'));
    if (!weight) return;
    plateSettings.set({ targetG: weight });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const setPlate = (id: string, patch: Partial<Plate>) => plateSettings.set({ plates: plates.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const addPlate = () => plateSettings.set({ plates: [...plates, { id: crypto.randomUUID(), weightG: 0, count: 2 }] });
  const removePlate = (id: string) => plateSettings.set({ plates: plates.filter((p) => p.id !== id) });
  const shown = targetG !== undefined ? answer(barG, targetG, plates) : null;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="title">Calculateur de disques</h1>

      <section className="stack">
        <h2 className="section-title">Charge</h2>
        <div className="steppers">
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Barre</span>
            <Stepper
              label="Poids de la barre"
              unit="kg"
              value={barG}
              step={500}
              format={formatKg}
              parse={parseKg}
              onChange={(v) => plateSettings.set({ barG: v })}
            />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Poids voulu</span>
            <Stepper
              label="Poids voulu"
              unit="kg"
              value={targetG}
              step={500}
              format={formatKg}
              parse={parseKg}
              onChange={(v) => plateSettings.set({ targetG: v })}
            />
          </div>
        </div>
      </section>

      {shown && 'error' in shown && <div className="card notice-warn">{shown.error}</div>}
      {shown && 'result' in shown && (
        <Result result={shown.result} targetG={targetG!} onUse={(g) => plateSettings.set({ targetG: g })} />
      )}

      <section className="stack">
        <h2 className="section-title">Mes disques</h2>
        {plates.map((p) => (
          <div key={p.id} className="card row plate-row">
            <label className="field plate-weight">
              <span>Poids (kg)</span>
              <ValueInput
                value={p.weightG}
                format={formatPlate}
                parse={parseKg}
                onCommit={(weightG) => setPlate(p.id, { weightG })}
                label="Poids du disque"
              />
            </label>
            <div className="grow">
              <Stepper
                label="Nombre de disques"
                unit="disques"
                value={p.count}
                step={1}
                min={1}
                format={formatCount}
                parse={parseCount}
                inputMode="numeric"
                onChange={(count) => setPlate(p.id, { count: Math.max(1, count) })}
              />
            </div>
            <button type="button" className="icon-btn" onClick={() => removePlate(p.id)} aria-label="Retirer ce disque">
              <Icon name="trash" size={20} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-dashed" onClick={addPlate}>
          <Icon name="plus" size={20} />
          Ajouter un disque
        </button>
      </section>
    </div>
  );
}
