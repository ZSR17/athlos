import { EXERCISE_TYPES, type ExerciseType, type Metric, type SetTarget } from '@athlos/shared';

export type ItemMode = 'simple' | 'per_set';

const DEFAULTS: Record<ExerciseType, { sets: number; target: Omit<SetTarget, 'kind'> }> = {
  weight_reps: { sets: 3, target: { reps: 10, weightG: 20000, restS: 90 } },
  bw_reps: { sets: 3, target: { reps: 10, restS: 90 } },
  weighted_bw: { sets: 3, target: { reps: 8, weightG: 5000, restS: 90 } },
  assisted_bw: { sets: 3, target: { reps: 8, weightG: 20000, restS: 90 } },
  duration: { sets: 3, target: { durationS: 30, restS: 60 } },
  duration_weight: { sets: 3, target: { durationS: 30, weightG: 10000, restS: 60 } },
  distance_duration: { sets: 1, target: { durationS: 1200, distanceM: 5000, restS: 0 } },
  weight_distance: { sets: 3, target: { weightG: 24000, distanceM: 40, restS: 90 } },
};

export function defaultTargets(type: ExerciseType): SetTarget[] {
  const { sets, target } = DEFAULTS[type];
  return Array.from({ length: sets }, () => ({ kind: 'normal' as const, ...target }));
}

export function metricsFor(type: ExerciseType): readonly Metric[] {
  return EXERCISE_TYPES[type].metrics;
}

export function metricLabel(metric: Metric, type: ExerciseType): string {
  if (metric === 'weight') return type === 'weighted_bw' ? '+Kg' : type === 'assisted_bw' ? '−Kg' : 'Kg';
  return { reps: 'Reps', duration: 'Temps', distance: 'Km' }[metric];
}

export function metricLongLabel(metric: Metric, type: ExerciseType): string {
  return metric === 'reps' ? 'Répétitions' : metricLabel(metric, type);
}

// Simple mode = N identical working sets. Leaving per-set mode keeps the first working set as the model.
export function toSimple(targets: SetTarget[]): SetTarget[] {
  const working = targets.filter((t) => t.kind !== 'warmup');
  const model = working[0] ?? targets[0];
  if (!model) return [];
  return Array.from({ length: Math.max(1, working.length) }, () => ({ ...model, kind: 'normal' as const }));
}

export function setSimpleCount(targets: SetTarget[], count: number): SetTarget[] {
  const model = targets[0];
  if (!model || count < 1) return targets;
  return Array.from({ length: count }, () => ({ ...model }));
}

// In simple mode a field edit applies to every set.
export function updateAll(targets: SetTarget[], patch: Partial<SetTarget>): SetTarget[] {
  return targets.map((t) => ({ ...t, ...patch }));
}

export function updateOne(targets: SetTarget[], index: number, patch: Partial<SetTarget>): SetTarget[] {
  return targets.map((t, i) => (i === index ? { ...t, ...patch } : t));
}

export function addSet(targets: SetTarget[], type: ExerciseType): SetTarget[] {
  const last = targets[targets.length - 1];
  return [...targets, last ? { ...last, kind: 'normal' } : defaultTargets(type)[0]!];
}

export function removeSet(targets: SetTarget[], index: number): SetTarget[] {
  return targets.length <= 1 ? targets : targets.filter((_, i) => i !== index);
}
