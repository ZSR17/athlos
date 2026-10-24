import { createStore } from './store.ts';

// Plates the user owns: count is the total, so a load uses them in pairs (one on each side).
export interface Plate {
  id: string;
  weightG: number;
  count: number;
}

// The last weight asked for, and whether its answer is shown, are kept too: they are still there when the page is reopened.
export const plateSettings = createStore<{ barG: number; plates: Plate[]; targetG?: number; calculated: boolean }>(
  { barG: 20000, plates: [], calculated: false },
  'halko.plates',
);

export interface Load {
  totalG: number;
  perSideG: number;
  // Plates on one side, heaviest first.
  perSide: { weightG: number; count: number }[];
}

export type PlateResult = { exact: true; load: Load } | { exact: false; below: Load; above: Load | null };

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

// Loads one side of the bar can take, using as few plates as possible for each weight.
// Weights are counted in steps of the plates' greatest common divisor, so the table stays small.
export function loadPlates(barG: number, targetG: number, plates: Pick<Plate, 'weightG' | 'count'>[]): PlateResult {
  const pairs = new Map<number, number>();
  for (const p of plates) {
    const n = Math.floor(p.count / 2);
    if (p.weightG > 0 && n > 0) pairs.set(p.weightG, (pairs.get(p.weightG) ?? 0) + n);
  }
  const kinds = [...pairs].sort(([a], [b]) => b - a);
  const step = kinds.reduce((g, [w]) => gcd(g, w), 0) || 1;
  const max = kinds.reduce((sum, [w, n]) => sum + (w / step) * n, 0);

  // best[s] = the fewest plates making s steps on one side (how many of each kind), if it can be made.
  const best: ({ plates: number; used: number[] } | undefined)[] = new Array(max + 1);
  best[0] = { plates: 0, used: kinds.map(() => 0) };
  kinds.forEach(([w, n], k) => {
    const size = w / step;
    for (let s = max; s >= size; s--) {
      for (let c = 1; c <= n && c * size <= s; c++) {
        const from = best[s - c * size];
        if (from && from.plates + c < (best[s]?.plates ?? Infinity)) {
          best[s] = { plates: from.plates + c, used: from.used.map((u, i) => (i === k ? u + c : u)) };
        }
      }
    }
  });

  const load = (s: number): Load => ({
    totalG: barG + 2 * s * step,
    perSideG: s * step,
    perSide: kinds.map(([weightG], i) => ({ weightG, count: best[s]!.used[i]! })).filter((p) => p.count > 0),
  });
  const wanted = (targetG - barG) / 2 / step;
  if (Number.isInteger(wanted) && best[wanted]) return { exact: true, load: load(wanted) };

  let below = Math.max(0, Math.min(Math.floor(wanted), max));
  while (!best[below]) below--;
  let above = Math.max(Math.ceil(wanted), 0);
  while (above <= max && !best[above]) above++;
  return { exact: false, below: load(below), above: above <= max ? load(above) : null };
}
