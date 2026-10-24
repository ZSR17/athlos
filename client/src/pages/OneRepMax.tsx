import { useState } from 'react';
import { Stepper } from '../components/Stepper.tsx';
import { formatKg, parseCount, parseKg } from '../lib/format.ts';
import { FORMULA_LABELS, type Formula, MAX_REPS, PERCENTAGES, oneRepMax, oneRmSettings } from '../lib/oneRm.ts';

const formatReps = (n: number | undefined) => (n === undefined ? '' : String(n));
// To the nearest 100 g: finer than any plate, no need for more.
const kg = (g: number) => `${formatKg(Math.round(g / 100) * 100)} kg`;

export function OneRepMax() {
  const { formula } = oneRmSettings.use();
  const [weightG, setWeightG] = useState<number>();
  const [reps, setReps] = useState<number>();
  const max = weightG && reps ? oneRepMax(weightG, reps, formula) : undefined;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="title">Calculateur de 1RM</h1>

      <section className="stack">
        <h2 className="section-title">Ta série</h2>
        <div className="steppers">
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Charge</span>
            <Stepper label="Charge" unit="kg" value={weightG} step={500} format={formatKg} parse={parseKg} onChange={setWeightG} />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Répétitions</span>
            <Stepper
              label="Répétitions"
              unit="reps"
              value={reps}
              step={1}
              min={1}
              format={formatReps}
              parse={parseCount}
              inputMode="numeric"
              onChange={(v) => setReps(Math.min(MAX_REPS, Math.max(1, v)))}
            />
          </div>
        </div>
      </section>

      <section className="stack">
        <h2 className="section-title">Formule</h2>
        <div className="chips-wrap">
          {(Object.keys(FORMULA_LABELS) as Formula[]).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={formula === f} onClick={() => oneRmSettings.set({ formula: f })}>
              {FORMULA_LABELS[f]}
            </button>
          ))}
        </div>
      </section>

      {max !== undefined && (
        <section className="stack">
          {reps! > 10 && (
            <div className="card notice-warn">Au-delà de 10 répétitions, l’estimation devient beaucoup moins précise.</div>
          )}
          <div className="card stack" style={{ gap: 4 }}>
            <span className="label">1RM estimé</span>
            <span className="title">{kg(max)}</span>
          </div>
          <div className="card percent-table">
            {PERCENTAGES.map((p) => (
              <div key={p} className="row between">
                <span className="muted">{p} %</span>
                <span className="percent-kg">{kg((max * p) / 100)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
