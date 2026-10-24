import type { ExerciseType } from '@halko/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { LineChart } from '../components/LineChart.tsx';
import { type LocalExercise, db } from '../db/db.ts';
import { exerciseHistory, finishedSessions } from '../db/sessions.ts';
import { formatSetValues } from '../lib/format.ts';
import { metricsForType } from '../lib/progress.ts';
import { formatMinutes, formatTonnage, sessionDurationMs, sessionVolumeG, startOfWeek } from '../lib/stats.ts';

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const fullFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function useHistoryData() {
  return useLiveQuery(async () => {
    const sessions = await finishedSessions();
    const ids = new Set(sessions.map((s) => s.id));
    const logs = (await db.setLogs.toArray()).filter((l) => !l.deleted && ids.has(l.sessionId));
    const exerciseIds = [...new Set(logs.map((l) => l.exerciseId))];
    const exercises = (await db.exercises.bulkGet(exerciseIds)).filter((e): e is LocalExercise => !!e);
    return { sessions, logs, exercises };
  }, []);
}

export function History() {
  const data = useHistoryData();
  const [tab, setTab] = useState<'sessions' | 'progress'>('sessions');

  const types = useMemo(() => new Map<string, ExerciseType>(data?.exercises.map((e) => [e.id, e.exerciseType]) ?? []), [data]);
  const bySession = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>['logs']>();
    for (const l of data?.logs ?? []) m.set(l.sessionId, [...(m.get(l.sessionId) ?? []), l]);
    return m;
  }, [data]);

  if (!data) return <div className="page muted">Chargement…</div>;

  const week = data.sessions.filter((s) => s.startedAt >= startOfWeek());
  const weekLogs = week.flatMap((s) => bySession.get(s.id) ?? []);

  return (
    <div className="page">
      <h1 className="title">Historique</h1>

      <section className="stats" aria-label="Cette semaine">
        <div className="stat">
          <span className="value">{week.length}</span>
          <span className="small muted">séance{week.length > 1 ? 's' : ''} cette semaine</span>
        </div>
        <div className="stat">
          <span className="value">{formatTonnage(sessionVolumeG(weekLogs, types))}</span>
          <span className="small muted">volume soulevé</span>
        </div>
        <div className="stat">
          <span className="value">{formatMinutes(week.reduce((n, s) => n + sessionDurationMs(s), 0))}</span>
          <span className="small muted">d'entraînement</span>
        </div>
      </section>

      <div className="seg" role="group" aria-label="Affichage" style={{ background: 'var(--surface)' }}>
        <button type="button" aria-pressed={tab === 'sessions'} onClick={() => setTab('sessions')}>
          Séances
        </button>
        <button type="button" aria-pressed={tab === 'progress'} onClick={() => setTab('progress')}>
          Progression
        </button>
      </div>

      {tab === 'sessions' ? (
        <div className="stack" style={{ gap: 8 }}>
          {data.sessions.length === 0 && <p className="muted">Aucune séance terminée pour l'instant.</p>}
          {data.sessions.map((s) => {
            const logs = bySession.get(s.id) ?? [];
            const volume = sessionVolumeG(logs, types);
            return (
              <Link key={s.id} to={`/historique/${s.id}`} className="list-item" style={{ padding: '12px 14px' }}>
                <span className="stack" style={{ width: 44, alignItems: 'center', gap: 0 }} aria-label={fullFmt.format(s.startedAt)}>
                  <span className="num" style={{ fontSize: 22, lineHeight: 1 }}>
                    {dayFmt.format(s.startedAt)}
                  </span>
                  <span className="small muted">{monthFmt.format(s.startedAt)}</span>
                </span>
                <span className="grow stack" style={{ gap: 2 }}>
                  <span className="ellipsis" style={{ fontWeight: 700 }}>
                    {s.name}
                  </span>
                  <span className="small muted">
                    {formatMinutes(sessionDurationMs(s))} · {logs.length} série{logs.length > 1 ? 's' : ''}
                    {volume > 0 && ` · ${formatTonnage(volume)}`}
                  </span>
                </span>
                <Icon name="chevron" size={18} />
              </Link>
            );
          })}
        </div>
      ) : (
        <Progress exercises={data.exercises} logs={data.logs} />
      )}
    </div>
  );
}

function Progress({ exercises, logs }: { exercises: LocalExercise[]; logs: { exerciseId: string; completedAt: number }[] }) {
  // Most recently trained first.
  const ordered = useMemo(() => {
    const last = new Map<string, number>();
    for (const l of logs) last.set(l.exerciseId, Math.max(last.get(l.exerciseId) ?? 0, l.completedAt));
    return [...exercises].sort((a, b) => (last.get(b.id) ?? 0) - (last.get(a.id) ?? 0));
  }, [exercises, logs]);
  const [selected, setSelected] = useState<string | null>(null);
  const exercise = ordered.find((e) => e.id === selected) ?? ordered[0];
  const metrics = exercise ? metricsForType(exercise.exerciseType) : [];
  const [metricId, setMetricId] = useState<string | null>(null);
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  const history = useLiveQuery(() => (exercise ? exerciseHistory(exercise.id) : []), [exercise?.id]);

  if (!exercise || !metric) return <p className="muted">Termine une séance pour voir ta progression.</p>;

  const rows = (history ?? [])
    .map((h) => ({ t: h.session.startedAt, y: metric.best(h.sets), sets: h.sets }))
    .filter((r): r is typeof r & { y: number } => r.y !== undefined);
  const records = rows.length ? (metric.higherIsBetter ? Math.max(...rows.map((r) => r.y)) : Math.min(...rows.map((r) => r.y))) : undefined;

  return (
    <div className="stack">
      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Exercice</span>
        <select className="input" value={exercise.id} onChange={(e) => setSelected(e.target.value)}>
          {ordered.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
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
          {records !== undefined && <span className="record">Record : {metric.format(records)}</span>}
        </div>
        {rows.length < 2 && <p className="small muted" style={{ margin: 0 }}>La courbe apparaît à partir de 2 séances.</p>}
        {rows.length >= 2 && <LineChart points={rows} format={metric.format} label={`${metric.label}, ${exercise.name}`} />}
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
              <tr key={r.t}>
                <td>{fullFmt.format(r.t)}</td>
                <td style={{ fontWeight: 700 }}>{metric.format(r.y)}</td>
                <td className="small muted">{r.sets.map((s) => formatSetValues(exercise.exerciseType, s)).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
