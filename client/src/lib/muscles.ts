import type { MuscleId } from '@halko/shared';

// Body-map regions (react-native-body-highlighter slugs) -> our muscle ids.
// Regions not listed (head, hands, knees…) are drawn as plain body.
const REGION_MUSCLES: Record<string, readonly MuscleId[]> = {
  chest: ['chest'],
  abs: ['abs'],
  obliques: ['abs'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearm: ['forearms'],
  deltoids: ['shoulders'],
  trapezius: ['traps'],
  neck: ['neck'],
  'upper-back': ['lats', 'middleback'],
  'lower-back': ['lowerback'],
  gluteal: ['glutes', 'abductors'],
  adductors: ['adductors'],
  quadriceps: ['quads'],
  hamstring: ['hamstrings'],
  calves: ['calves'],
  tibialis: [],
};

export type RegionState = 'primary' | 'secondary' | 'idle' | 'body';

export function regionState(region: string, primary: readonly string[], secondary: readonly string[]): RegionState {
  const muscles = REGION_MUSCLES[region];
  if (!muscles) return 'body';
  if (muscles.some((m) => primary.includes(m))) return 'primary';
  if (muscles.some((m) => secondary.includes(m))) return 'secondary';
  return 'idle';
}
