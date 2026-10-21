import type { ExerciseType, SetTarget } from '@athlos/shared';

// Snapshot of a workout item taken when the session starts, so editing the workout
// mid-session does not move the ground under the user.
export interface PlanItem {
  itemId: string;
  exerciseId: string;
  exerciseType: ExerciseType;
  supersetGroup: string | null;
  targets: SetTarget[];
  note: string | null;
}

export interface Step {
  item: number;
  set: number;
  target: SetTarget;
}

export type SetValues = Pick<SetTarget, 'reps' | 'weightG' | 'durationS' | 'distanceM'>;

export function setCount(plan: PlanItem[], extra: Record<string, number>, item: number): number {
  const p = plan[item]!;
  return p.targets.length + (extra[p.itemId] ?? 0);
}

export function targetFor(plan: PlanItem[], item: number, set: number): SetTarget {
  const targets = plan[item]!.targets;
  const last = targets[targets.length - 1]!;
  return targets[set] ?? { ...last, kind: 'normal' };
}

// Execution order. Items of a superset are interleaved round by round (A1 B1 A2 B2…);
// an item with more sets than its partners finishes its extra sets alone.
export function buildSteps(plan: PlanItem[], extra: Record<string, number> = {}): Step[] {
  const steps: Step[] = [];
  for (let start = 0; start < plan.length; ) {
    const group = plan[start]!.supersetGroup;
    let end = start;
    while (group && plan[end + 1]?.supersetGroup === group) end++;
    const counts = Array.from({ length: end - start + 1 }, (_, k) => setCount(plan, extra, start + k));
    for (let round = 0; round < Math.max(...counts); round++) {
      for (let item = start; item <= end; item++) {
        if (round < counts[item - start]!) steps.push({ item, set: round, target: targetFor(plan, item, round) });
      }
    }
    start = end + 1;
  }
  return steps;
}

// No rest between exercises of the same superset round; otherwise the set's planned rest.
export function restAfter(plan: PlanItem[], steps: Step[], index: number): number {
  const cur = steps[index];
  const next = steps[index + 1];
  if (!cur || !next) return 0;
  const group = plan[cur.item]!.supersetGroup;
  if (group && plan[next.item]!.supersetGroup === group && next.set === cur.set && next.item > cur.item) return 0;
  return cur.target.restS ?? 90;
}

// Set number as shown to the user: warm-up sets are not counted, extra sets continue the count.
export function workingNumber(item: PlanItem, set: number): number {
  return item.targets.slice(0, set + 1).filter((t) => t.kind !== 'warmup').length + Math.max(0, set + 1 - item.targets.length);
}

// "Série 2 · Squat", "Échauffement · Squat".
export function stepLabel(plan: PlanItem[], step: Step, exerciseName: string): string {
  return `${step.target.kind === 'warmup' ? 'Échauffement' : `Série ${workingNumber(plan[step.item]!, step.set)}`} · ${exerciseName}`;
}

export function stepKey(plan: PlanItem[], step: Step): string {
  return `${plan[step.item]!.itemId}:${step.set}`;
}

// First step after `from` (wrapping around) that is not done yet; -1 when everything is done.
export function nextOpenStep(plan: PlanItem[], steps: Step[], done: Set<string>, from: number): number {
  for (let k = 1; k <= steps.length; k++) {
    const i = (from + k) % steps.length;
    if (!done.has(stepKey(plan, steps[i]!))) return i;
  }
  return -1;
}

// Values the inputs start with: what was done last time for this set, else the plan.
export function prefill(target: SetTarget, previous: SetValues | undefined): SetValues {
  const src = previous ?? target;
  return { reps: src.reps ?? target.reps, weightG: src.weightG ?? target.weightG, durationS: src.durationS ?? target.durationS, distanceM: src.distanceM ?? target.distanceM };
}

// Epley estimate, only meaningful for reasonably low reps.
export function estimate1RM(weightG: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightG;
  return Math.round(weightG * (1 + Math.min(reps, 12) / 30));
}

// Volume = load moved: weight × reps for loaded exercises.
export function setVolumeG(type: ExerciseType, v: SetValues): number {
  if (type === 'weight_reps' || type === 'weighted_bw') return (v.weightG ?? 0) * (v.reps ?? 0);
  return 0;
}
