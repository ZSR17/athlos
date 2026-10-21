import type { ExerciseType } from '@athlos/shared';
import type { LocalSession, LocalSetLog } from '../db/db.ts';
import { setVolumeG } from './session.ts';

export function sessionVolumeG(logs: LocalSetLog[], types: Map<string, ExerciseType>): number {
  return logs
    .filter((l) => l.kind !== 'warmup')
    .reduce((n, l) => n + setVolumeG(types.get(l.exerciseId) ?? 'weight_reps', l), 0);
}

export function sessionDurationMs(s: LocalSession): number {
  return (s.endedAt ?? s.startedAt) - s.startedAt;
}

// Monday 00:00 of the current week, local time.
export function startOfWeek(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function formatTonnage(grams: number): string {
  if (grams <= 0) return '—';
  const kg = grams / 1000;
  return kg >= 10000 ? `${(kg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} t` : `${Math.round(kg).toLocaleString('fr-FR')} kg`;
}

export function formatMinutes(ms: number): string {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
