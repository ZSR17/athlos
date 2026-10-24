import type { ExerciseType } from '@halko/shared';
import { formatDuration, formatKg, formatKm } from './format.ts';
import { type SetValues, estimate1RM, setVolumeG } from './session.ts';

type Log = SetValues & { kind: string };

interface ProgressMetric {
  id: string;
  label: string;
  format: (v: number) => string;
  // Best value of one session's sets, undefined when the session has none.
  best: (sets: Log[]) => number | undefined;
  higherIsBetter: boolean;
}

const working = (sets: Log[]) => sets.filter((s) => s.kind !== 'warmup');
const max = (values: (number | undefined)[]) => {
  const v = values.filter((x): x is number => x !== undefined && x > 0);
  return v.length ? Math.max(...v) : undefined;
};
const min = (values: (number | undefined)[]) => {
  const v = values.filter((x): x is number => x !== undefined && x > 0);
  return v.length ? Math.min(...v) : undefined;
};

const kg = (g: number) => `${formatKg(g)} kg`;
const km = (m: number) => `${formatKm(m)} km`;

export function metricsForType(type: ExerciseType): ProgressMetric[] {
  const maxWeight = (label: string): ProgressMetric => ({
    id: 'weight',
    label,
    format: kg,
    best: (s) => max(working(s).map((x) => x.weightG)),
    higherIsBetter: true,
  });
  switch (type) {
    case 'weight_reps':
      return [
        maxWeight('Charge max'),
        {
          id: 'volume',
          label: 'Volume',
          format: kg,
          best: (s) => {
            const v = working(s).reduce((n, x) => n + setVolumeG(type, x), 0);
            return v > 0 ? v : undefined;
          },
          higherIsBetter: true,
        },
        {
          id: '1rm',
          label: '1RM estimé',
          format: kg,
          best: (s) => max(working(s).map((x) => (x.weightG && x.reps ? estimate1RM(x.weightG, x.reps) : undefined))),
          higherIsBetter: true,
        },
      ];
    case 'bw_reps':
      return [{ id: 'reps', label: 'Répétitions max', format: (v) => `${v} reps`, best: (s) => max(working(s).map((x) => x.reps)), higherIsBetter: true }];
    case 'weighted_bw':
      return [maxWeight('Lest max')];
    case 'assisted_bw':
      return [{ id: 'assist', label: 'Assistance min', format: kg, best: (s) => min(working(s).map((x) => x.weightG)), higherIsBetter: false }];
    case 'duration':
      return [{ id: 'duration', label: 'Meilleur temps', format: formatDuration, best: (s) => max(working(s).map((x) => x.durationS)), higherIsBetter: true }];
    case 'duration_weight':
      return [maxWeight('Charge max')];
    case 'distance_duration':
      return [{ id: 'distance', label: 'Distance max', format: km, best: (s) => max(working(s).map((x) => x.distanceM)), higherIsBetter: true }];
    case 'weight_distance':
      return [maxWeight('Charge max')];
  }
}

function isBetter(metric: ProgressMetric, value: number, previousBest: number | undefined): boolean {
  if (previousBest === undefined) return false; // first time is not a "record"
  return metric.higherIsBetter ? value > previousBest : value < previousBest;
}

// Value of `metric` that this session beat, if it set a record against all earlier sessions.
export function recordFor(metric: ProgressMetric, earlier: Log[][], current: Log[]): { value: number; previous: number } | null {
  const value = metric.best(current);
  if (value === undefined) return null;
  const bests = earlier.map(metric.best).filter((v): v is number => v !== undefined);
  if (!bests.length) return null;
  const previous = metric.higherIsBetter ? Math.max(...bests) : Math.min(...bests);
  return isBetter(metric, value, previous) ? { value, previous } : null;
}
