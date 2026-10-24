import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LocalExercise, LocalSession, LocalSetLog } from '../db/db.ts';
import { formatSetValues } from '../lib/format.ts';
import { metricsForType } from '../lib/progress.ts';
import { createStore } from '../lib/store.ts';
import { LineChart } from './LineChart.tsx';

// Months shown by the chart, counted back from today (0 = since the first session).
const PERIODS = {
  '3m': { label: '3 mois', months: 3 },
  '1y': { label: '1 an', months: 12 },
  all: { label: 'Tout', months: 0 },
} as const;
type Period = keyof typeof PERIODS;
// The chart's period, remembered on the device.
const chartSettings = createStore<{ period: Period }>({ period: '3m' }, 'halko.chart');

// Sessions listed under the chart before « Voir les … autres ».
const LISTED = 10;

const shortFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fullFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// Chart and table of an exercise's finished sessions, for one measure at a time (charge, volume…).
export function ExerciseProgress({ exercise, history }: { exercise: LocalExercise; history: { session: LocalSession; sets: LocalSetLog[] }[] }) {
  const metrics = metricsForType(exercise.exerciseType);
  const [metricId, setMetricId] = useState<string | null>(null);
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  const { period } = chartSettings.use();
  const [expanded, setExpanded] = useState(false);
  if (!metric) return null;

  const rows = history
    .map((h) => ({ session: h.session, y: metric.best(h.sets), sets: h.sets }))
    .filter((r): r is typeof r & { y: number } => r.y !== undefined);
  const since = new Date();
  since.setMonth(since.getMonth() - PERIODS[period].months);
  const shown = PERIODS[period].months ? rows.filter((r) => r.session.startedAt >= since.getTime()) : rows;
  // The table follows the chart's period, latest first.
  const latest = [...shown].reverse();
  const listed = expanded ? latest : latest.slice(0, LISTED);
  // An estimated 1RM is not a weight actually lifted: its record is not shown.
  const records = rows.length ? (metric.higherIsBetter ? Math.max(...rows.map((r) => r.y)) : Math.min(...rows.map((r) => r.y))) : undefined;

  // Best of each measure over the whole history, and the session it was set in (the first, on a tie).
  // The estimated 1RM is left out: it is not a weight actually lifted.
  const bests = metrics
    .filter((m) => m.id !== '1rm')
    .map((m) => {
      let best: { value: number; session: LocalSession } | undefined;
      for (const h of history) {
        const value = m.best(h.sets);
        if (value !== undefined && (!best || (m.higherIsBetter ? value > best.value : value < best.value))) best = { value, session: h.session };
      }
      return best && { metric: m, ...best };
    })
    .filter((b) => b !== undefined);

  return (
    <>
      {bests.length > 0 && (
        <div className="stats" aria-label="Records">
          {bests.map((b) => (
            <Link key={b.metric.id} to={`/historique/${b.session.id}`} className="stat record-stat">
              <span className="small muted">{b.metric.label}</span>
              <span className="value">{b.metric.format(b.value)}</span>
              <span className="small muted">{shortFmt.format(b.session.startedAt)}</span>
            </Link>
          ))}
        </div>
      )}
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
        <div className="seg" role="group" aria-label="Période du graphique">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => (chartSettings.set({ period: p }), setExpanded(false))}>
              {PERIODS[p].label}
            </button>
          ))}
        </div>
        {shown.length < 2 && (
          <p className="small muted" style={{ margin: 0 }}>
            {rows.length < 2 ? 'La courbe apparaît à partir de 2 séances.' : 'Moins de 2 séances sur cette période : choisis une période plus longue.'}
          </p>
        )}
        {shown.length >= 2 && (
          <LineChart points={shown.map((r) => ({ t: r.session.startedAt, y: r.y }))} format={metric.format} label={`${metric.label}, ${exercise.name}`} />
        )}
      </div>
      {listed.length > 0 && (
        <div className="card stack" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">{metric.label}</th>
                <th scope="col">Séries</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((r) => (
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
          {shown.length > LISTED && (
            <button type="button" className="btn btn-ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
              {expanded ? 'Réduire' : `Voir les ${shown.length - LISTED} autres séances`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
