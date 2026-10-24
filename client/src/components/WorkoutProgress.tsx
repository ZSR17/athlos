import type { ExerciseType } from '@halko/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db.ts';
import { workoutHistory } from '../db/sessions.ts';
import { formatTonnage, formatMinutes, sessionDurationMs, sessionVolumeG } from '../lib/stats.ts';
import { type PanelMetric, ProgressPanel } from './ProgressPanel.tsx';

// Records, chart and table of the sessions done from a workout: volume, reps and duration of each.
export function WorkoutProgress({ workoutId, name }: { workoutId: string; name: string }) {
  const data = useLiveQuery(async () => {
    const history = await workoutHistory(workoutId);
    const ids = [...new Set(history.flatMap((h) => h.sets.map((l) => l.exerciseId)))];
    const exercises = await db.exercises.bulkGet(ids);
    const types = new Map<string, ExerciseType>(exercises.filter((e) => e !== undefined).map((e) => [e.id, e.exerciseType]));
    return { history, types };
  }, [workoutId]);
  if (!data?.history.length) return null;

  const { history, types } = data;
  // What none of the measures shows: how many exercises and sets the session had.
  const detail = (h: (typeof history)[number]) => {
    const exercises = new Set(h.sets.map((l) => l.exerciseId)).size;
    return `${exercises} exercice${exercises > 1 ? 's' : ''} · ${h.sets.length} série${h.sets.length > 1 ? 's' : ''}`;
  };
  const measure = (id: string, label: string, format: (v: number) => string, value: (h: (typeof history)[number]) => number, record = true): PanelMetric => ({
    id,
    label,
    format,
    higherIsBetter: true,
    record,
    rows: history.flatMap((h) => {
      const v = value(h);
      return v > 0 ? [{ session: h.session, value: v, detail: detail(h) }] : [];
    }),
  });
  const metrics = [
    measure('volume', 'Volume', formatTonnage, (h) => sessionVolumeG(h.sets, types)),
    measure('reps', 'Reps totales', (v) => `${v} reps`, (h) => h.sets.filter((l) => l.kind !== 'warmup').reduce((n, l) => n + (l.reps ?? 0), 0)),
    // A longer session is not better: no record for the duration.
    measure('duration', 'Durée', formatMinutes, (h) => sessionDurationMs(h.session), false),
  ].filter((m) => m.rows.length > 0);

  return (
    <section className="stack">
      <h2 className="label">Historique</h2>
      <ProgressPanel name={name} metrics={metrics} detailLabel="Séance" />
    </section>
  );
}
