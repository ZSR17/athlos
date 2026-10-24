// Usage: npm run seed:history
// Fills a development database with three workouts (Push / Pull / Jambes) and 12 weeks of finished
// sessions, with a steady progression, a few missed reps and a lighter week, to try the history,
// records and charts. Rows have fixed ids: running it again rewrites the same history.
import type { SetKind, SetTarget } from '@halko/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { loadConfig } from '../config.ts';
import { ensureOwner, openDb } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import { sync } from '../sync.ts';

const weeks = 12;

// kg: starting load, step: kg added each week (0 for body weight), or seconds for a timed exercise.
interface Plan {
  name: string;
  sets: number;
  reps: number;
  kg?: number;
  step?: number;
  seconds?: number;
  warmups?: number;
  restS: number;
}

const WORKOUTS: { key: string; name: string; items: Plan[] }[] = [
  {
    key: 'push',
    name: 'Push',
    items: [
      { name: 'Développé couché', sets: 4, reps: 8, kg: 60, step: 2.5, warmups: 2, restS: 150 },
      { name: 'Développé militaire', sets: 3, reps: 8, kg: 35, step: 1.25, warmups: 1, restS: 120 },
      { name: 'Élévations latérales', sets: 3, reps: 12, kg: 8, step: 0.5, restS: 60 },
      { name: 'Dips (triceps)', sets: 3, reps: 8, restS: 90 },
      { name: 'Extension triceps nuque à la corde (poulie basse)', sets: 3, reps: 12, kg: 20, step: 1, restS: 60 },
    ],
  },
  {
    key: 'pull',
    name: 'Pull',
    items: [
      { name: 'Soulevé de terre', sets: 3, reps: 5, kg: 90, step: 5, warmups: 2, restS: 180 },
      { name: 'Tractions en supination', sets: 3, reps: 6, restS: 120 },
      { name: 'Rowing barre buste penché', sets: 4, reps: 8, kg: 50, step: 2.5, restS: 90 },
      { name: 'Tirage vertical prise large', sets: 3, reps: 10, kg: 45, step: 2.5, restS: 90 },
      { name: 'Face pull', sets: 3, reps: 15, kg: 15, step: 1, restS: 60 },
      { name: 'Curl à la barre', sets: 3, reps: 10, kg: 25, step: 1, restS: 60 },
    ],
  },
  {
    key: 'legs',
    name: 'Jambes',
    items: [
      { name: 'Squat à la barre', sets: 4, reps: 6, kg: 70, step: 2.5, warmups: 2, restS: 180 },
      { name: 'Presse à cuisses', sets: 3, reps: 10, kg: 120, step: 5, restS: 120 },
      { name: 'Leg curl assis', sets: 3, reps: 12, kg: 35, step: 1.25, restS: 75 },
      { name: 'Fentes aux haltères', sets: 3, reps: 10, kg: 14, step: 1, restS: 90 },
      { name: 'Mollets assis à la barre', sets: 4, reps: 15, kg: 30, step: 2.5, restS: 60 },
      { name: 'Gainage (planche)', sets: 3, reps: 0, seconds: 45, restS: 60 },
    ],
  },
];

// Deterministic randomness, so the history is the same on every run.
let seed = 42;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const config = loadConfig();
const db = openDb(config.dataDir);
const userId = ensureOwner(db);

const exerciseId = (name: string) => {
  const row = db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.name, name), isNull(schema.exercises.userId), eq(schema.exercises.deleted, false)))
    .get();
  if (!row) throw new Error(`Exercice introuvable : « ${name} ». Lance d'abord npm run import:exercises.`);
  return row.id;
};

const now = Date.now();
const DAY = 86_400_000;
const g = (kg: number) => Math.round(kg * 1000);
const roundTo = (kg: number, step: number) => Math.round(kg / step) * step;

const workouts: unknown[] = [];
const workoutItems: unknown[] = [];
const sessions: unknown[] = [];
const setLogs: unknown[] = [];

// Load or reps of a plan for a given week; week 8 is a lighter one.
function load(plan: Plan, week: number) {
  const deload = week === 7;
  if (plan.seconds !== undefined) return { seconds: plan.seconds + week * 5 };
  if (plan.kg === undefined) return { reps: plan.reps + Math.floor(week / 3) };
  const kg = roundTo((plan.kg + plan.step! * week) * (deload ? 0.85 : 1), plan.step! < 1 ? 0.5 : 1.25);
  return { kg };
}

function targets(plan: Plan, week: number): SetTarget[] {
  const l = load(plan, week);
  const list: SetTarget[] = [];
  for (let w = 0; w < (plan.warmups ?? 0); w++) {
    list.push({ kind: 'warmup', reps: 8 - w * 3, weightG: g(roundTo((l.kg ?? 0) * (0.4 + w * 0.25), 2.5)), restS: 60 });
  }
  for (let s = 0; s < plan.sets; s++) {
    if (l.seconds !== undefined) list.push({ kind: 'normal', durationS: l.seconds, restS: plan.restS });
    else list.push({ kind: 'normal', reps: l.reps ?? plan.reps, ...(l.kg !== undefined && { weightG: g(l.kg) }), restS: plan.restS });
  }
  return list;
}

// Monday 18:00, (weeks - 1) weeks before the current one.
const start = new Date(now - (((new Date(now).getDay() + 6) % 7) + (weeks - 1) * 7) * DAY);
start.setHours(18, 0, 0, 0);

WORKOUTS.forEach((w, wi) => {
  workouts.push({ id: `seed-w-${w.key}`, sport: 'strength', name: w.name, note: null, position: 100 + wi, createdAt: start.getTime(), updatedAt: now, deleted: false });
  w.items.forEach((plan, ii) => {
    workoutItems.push({
      id: `seed-i-${w.key}-${ii}`,
      workoutId: `seed-w-${w.key}`,
      exerciseId: exerciseId(plan.name),
      position: ii,
      mode: 'per_set',
      supersetGroup: null,
      targets: targets(plan, weeks - 1),
      note: null,
      createdAt: start.getTime(),
      updatedAt: now,
      deleted: false,
    });
  });
});

// Monday Push, Wednesday Pull, Friday Jambes; about one session in twelve is skipped.
let count = 0;
for (let week = 0; week < weeks; week++) {
  WORKOUTS.forEach((w, wi) => {
    const begin = start.getTime() + (week * 7 + wi * 2) * DAY + Math.round((random() - 0.5) * 2 * 3_600_000);
    if (begin > now - 3_600_000 || random() < 0.08) return;
    const sessionId = `seed-s-${week}-${w.key}`;
    let at = begin + 5 * 60_000;
    w.items.forEach((plan, ii) => {
      targets(plan, week).forEach((t, setIndex) => {
        let reps = t.reps;
        // Heavy last sets sometimes fall a rep or two short.
        if (t.kind === 'normal' && reps && setIndex === (plan.warmups ?? 0) + plan.sets - 1 && random() < 0.3) reps -= 1 + Math.floor(random() * 2);
        at += (t.durationS ?? 40) * 1000 + (t.restS ?? 60) * 1000 * (0.9 + random() * 0.3);
        setLogs.push({
          id: `seed-l-${week}-${w.key}-${ii}-${setIndex}`,
          sessionId,
          exerciseId: exerciseId(plan.name),
          workoutItemId: `seed-i-${w.key}-${ii}`,
          position: ii,
          setIndex,
          kind: t.kind as SetKind,
          ...(reps !== undefined && { reps }),
          ...(t.weightG !== undefined && { weightG: t.weightG }),
          ...(t.durationS !== undefined && { durationS: t.durationS }),
          completedAt: Math.round(at),
          createdAt: Math.round(at),
          updatedAt: now,
          deleted: false,
        });
      });
      at += 90_000;
    });
    sessions.push({ id: sessionId, workoutId: `seed-w-${w.key}`, sport: 'strength', name: w.name, startedAt: begin, endedAt: Math.round(at), note: null, createdAt: begin, updatedAt: now, deleted: false });
    count++;
  });
}

// Pushed like a device would, in the order the references need.
const rejected = [
  ...sync(db, userId, Number.MAX_SAFE_INTEGER, { workouts, workoutItems }).rejected,
  ...sync(db, userId, Number.MAX_SAFE_INTEGER, { sessions }).rejected,
  ...sync(db, userId, Number.MAX_SAFE_INTEGER, { setLogs }).rejected,
];
db.$client.close();

if (rejected.length) {
  console.error(`${rejected.length} lignes refusées :`, rejected.slice(0, 5));
  process.exit(1);
}
console.log(`${config.dataDir} : séances Push, Pull et Jambes, ${count} séances faites sur ${weeks} semaines, ${setLogs.length} séries.`);
