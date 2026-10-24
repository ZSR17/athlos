import { createStore } from './store.ts';

// One-rep max estimates from a set of `reps` at `w` (any unit). Most of them assume a set taken close to failure.
export const FORMULAS = {
  brzycki: { label: 'Brzycki', estimate: (w: number, reps: number) => (w * 36) / (37 - reps) },
  epley: { label: 'Epley', estimate: (w: number, reps: number) => w * (1 + reps / 30) },
  mcglothin: { label: 'McGlothin', estimate: (w: number, reps: number) => (100 * w) / (101.3 - 2.67123 * reps) },
  lombardi: { label: 'Lombardi', estimate: (w: number, reps: number) => w * reps ** 0.1 },
  mayhew: { label: 'Mayhew', estimate: (w: number, reps: number) => (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * reps)) },
  oconner: { label: 'O’Conner', estimate: (w: number, reps: number) => w * (1 + 0.025 * reps) },
  wathen: { label: 'Wathen', estimate: (w: number, reps: number) => (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * reps)) },
} as const;

export type Formula = keyof typeof FORMULAS | 'average';

export const FORMULA_LABELS: Record<Formula, string> = {
  ...(Object.fromEntries(Object.entries(FORMULAS).map(([k, f]) => [k, f.label])) as Record<keyof typeof FORMULAS, string>),
  average: 'Moyenne',
};

// Brzycki divides by (37 - reps): past this, its estimate is meaningless.
export const MAX_REPS = 30;

export const PERCENTAGES = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];

export const oneRmSettings = createStore<{ formula: Formula }>({ formula: 'brzycki' }, 'halko.oneRm');

// A single rep is the max itself, whatever the formula.
export function oneRepMax(weightG: number, reps: number, formula: Formula): number {
  if (reps <= 1) return weightG;
  const all = Object.values(FORMULAS);
  const value =
    formula === 'average' ? all.reduce((sum, f) => sum + f.estimate(weightG, reps), 0) / all.length : FORMULAS[formula].estimate(weightG, reps);
  return Math.round(value);
}
