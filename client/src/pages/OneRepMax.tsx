import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Stepper } from '../components/Stepper.tsx';
import type { LocalSetLog } from '../db/db.ts';
import { liftedSets } from '../db/sessions.ts';
import { formatKg, parseCount, parseKg } from '../lib/format.ts';
import { FORMULAS, type Formula, MAX_REPS, PERCENTAGES, oneRepMax, oneRmSettings, repsAt } from '../lib/oneRm.ts';

const formatReps = (n: number | undefined) => (n === undefined ? '' : String(n));
const parseReps = (s: string) => {
  const n = parseCount(s);
  return n === null ? null : Math.min(MAX_REPS, Math.max(1, n));
};
// To the nearest 100 g: finer than any plate, no need for more.
const round = (g: number) => Math.round(g / 100) * 100;
const kg = (g: number) => `${formatKg(g)} kg`;
const day = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function OneRepMax() {
  const stored = oneRmSettings.use().formula;
  const formula: Formula = stored in FORMULAS ? stored : 'brzycki';
  const lifted = useLiveQuery(() => liftedSets(), []);
  const [exerciseId, setExerciseId] = useState('');
  const [typed, setTyped] = useState<{ weightG?: number; reps?: number }>({});
  // Reps in reserve: the formulas assume a set taken to failure, so those are counted as done.
  const [reserve, setReserve] = useState(0);

  // Picking an exercise fills in its best set for the chosen formula, until the values are edited by hand.
  const best = (lifted?.find((l) => l.exercise.id === exerciseId)?.sets ?? [])
    .filter((s) => s.reps! <= MAX_REPS)
    .reduce<LocalSetLog | undefined>(
      (top, s) => (!top || oneRepMax(s.weightG!, s.reps!, formula) > oneRepMax(top.weightG!, top.reps!, formula) ? s : top),
      undefined,
    );
  const { weightG, reps } = best ?? typed;
  const edit = (patch: { weightG?: number; reps?: number }) => {
    setTyped({ weightG, reps, ...patch });
    setExerciseId('');
  };
  const toFailure = reps && Math.min(MAX_REPS, reps + reserve);
  const max = weightG && toFailure ? oneRepMax(weightG, toFailure, formula) : undefined;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="title">Calculateur de 1RM</h1>

      <section className="stack">
        <h2 className="section-title">Ta série</h2>
        {!!lifted?.length && (
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">Depuis ton historique</span>
            <select className="input" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
              <option value="">Choisir un exercice…</option>
              {lifted.map((l) => (
                <option key={l.exercise.id} value={l.exercise.id}>
                  {l.exercise.name}
                </option>
              ))}
            </select>
            {best && (
              <span className="small muted">
                Ta meilleure série : {kg(best.weightG!)} × {best.reps}, le {day(best.completedAt)}
              </span>
            )}
          </label>
        )}
        <div className="steppers">
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Charge</span>
            <Stepper label="Charge" unit="kg" value={weightG} step={500} format={formatKg} parse={parseKg} onChange={(v) => edit({ weightG: v })} />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Répétitions</span>
            <Stepper
              label="Répétitions"
              unit="reps"
              value={reps}
              step={1}
              min={1}
              max={MAX_REPS}
              format={formatReps}
              parse={parseReps}
              inputMode="numeric"
              onChange={(v) => edit({ reps: Math.max(1, v) })}
            />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">En réserve</span>
            <Stepper
              label="Répétitions en réserve"
              unit="reps"
              value={reserve}
              step={1}
              max={10}
              format={formatReps}
              parse={(t) => {
                const n = parseCount(t);
                return n === null ? null : Math.min(10, n);
              }}
              inputMode="numeric"
              onChange={setReserve}
            />
          </div>
        </div>
      </section>

      <section className="stack">
        <h2 className="section-title">Formule</h2>
        <div className="chips-wrap">
          {(Object.keys(FORMULAS) as Formula[]).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={formula === f} onClick={() => oneRmSettings.set({ formula: f })}>
              {FORMULAS[f].label}
            </button>
          ))}
        </div>
      </section>

      {max !== undefined && (
        <section className="stack">
          {toFailure! > 10 && (
            <div className="card notice-warn">Au-delà de 10 répétitions, l’estimation devient beaucoup moins précise.</div>
          )}
          <div className="card stack" style={{ gap: 4 }}>
            <span className="label">1RM estimé</span>
            <span className="title">{kg(round(max))}</span>
            {reserve > 0 && (
              <span className="small muted">
                Compté comme {toFailure} répétitions jusqu’à l’échec ({reps} faites + {reserve} en réserve)
              </span>
            )}
          </div>
          <div className="card percent-table">
            {PERCENTAGES.map((p) => {
              const g = round((max * p) / 100);
              const r = repsAt(p, formula);
              return (
                <Link key={p} to={`/disques?poids=${g}`} className="row" aria-label={`${p} % : ${kg(g)}, voir les disques`}>
                  <span className="percent">{p} %</span>
                  <span className="grow small muted">{r === null ? `${MAX_REPS}+ reps` : `≈ ${r} rep${r > 1 ? 's' : ''}`}</span>
                  <span className="percent-kg">{kg(g)}</span>
                  <Icon name="chevron" size={16} />
                </Link>
              );
            })}
          </div>
          <span className="small muted">Touche une ligne pour voir les disques à mettre sur la barre.</span>
        </section>
      )}
    </div>
  );
}
