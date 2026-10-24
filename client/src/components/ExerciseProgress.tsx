import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LocalExercise, LocalSession, LocalSetLog } from '../db/db.ts';
import { formatSetValues } from '../lib/format.ts';
import { metricsForType } from '../lib/progress.ts';
import { LineChart } from './LineChart.tsx';

const fullFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// Chart and table of an exercise's finished sessions, for one measure at a time (charge, volume…).
export function ExerciseProgress({ exercise, history }: { exercise: LocalExercise; history: { session: LocalSession; sets: LocalSetLog[] }[] }) {
  const metrics = metricsForType(exercise.exerciseType);
  const [metricId, setMetricId] = useState<string | null>(null);
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  if (!metric) return null;

  const rows = history
    .map((h) => ({ session: h.session, y: metric.best(h.sets), sets: h.sets }))
    .filter((r): r is typeof r & { y: number } => r.y !== undefined);
  // An estimated 1RM is not a weight actually lifted: its record is not shown.
  const records = rows.length ? (metric.higherIsBetter ? Math.max(...rows.map((r) => r.y)) : Math.min(...rows.map((r) => r.y))) : undefined;

  return (
    <>
      {metrics.length > 1 && (
        <div className="chips" role="group" aria-label="Mesure">
          {metrics.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={m.id === metric.id} onClick={() => setMetricId(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div className="card stack">
        <div className="row between wrap">
          <h2 style={{ fontSize: 15 }}>
            {metric.label} · {exercise.name}
          </h2>
          {records !== undefined && (
            // Hidden rather than removed for the 1RM, so the chart does not move when switching.
            <span className="record" style={metric.id === '1rm' ? { visibility: 'hidden' } : undefined} aria-hidden={metric.id === '1rm'}>
              Record : {metric.format(records)}
            </span>
          )}
        </div>
        {rows.length < 2 && <p className="small muted" style={{ margin: 0 }}>La courbe apparaît à partir de 2 séances.</p>}
        {rows.length >= 2 && (
          <LineChart points={rows.map((r) => ({ t: r.session.startedAt, y: r.y }))} format={metric.format} label={`${metric.label}, ${exercise.name}`} />
        )}
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{metric.label}</th>
              <th scope="col">Séries</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.session.id}>
                <td>
                  <Link to={`/historique/${r.session.id}`}>{fullFmt.format(r.session.startedAt)}</Link>
                </td>
                <td style={{ fontWeight: 700 }}>{metric.format(r.y)}</td>
                <td className="small muted">{r.sets.map((s) => formatSetValues(exercise.exerciseType, s)).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
