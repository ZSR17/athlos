import { z } from 'zod';
import { EXERCISE_TYPE_IDS, type ExerciseType, MUSCLE_IDS, type MuscleId, SET_KINDS, SPORTS } from './domain.ts';

// Wire format of the sync protocol. Rows are the server tables in camelCase, without user ids
// (the server owns them). Conflicts are resolved per row: the most recent `updatedAt` wins.

const id = z.string().min(1).max(64);
const ts = z.number().int().nonnegative();
const base = { id, createdAt: ts, updatedAt: ts, deleted: z.boolean() };
// Media files are named by the sha256 of their bytes.
export const mediaId = z.string().regex(/^[0-9a-f]{64}$/);

const setTarget = z.object({
  kind: z.enum(SET_KINDS),
  reps: z.number().int().nonnegative().optional(),
  weightG: z.number().int().nonnegative().optional(),
  durationS: z.number().nonnegative().optional(),
  distanceM: z.number().nonnegative().optional(),
  restS: z.number().int().nonnegative().optional(),
});

export const wireSchemas = {
  // Custom exercises are created as-is. Edits of a built-in exercise are stored by the server as
  // this user's version of it (the shared library is left untouched).
  exercises: z.object({
    ...base,
    source: z.enum(['builtin', 'custom']),
    name: z.string().trim().min(1).max(200),
    sport: z.enum(SPORTS),
    exerciseType: z.enum(EXERCISE_TYPE_IDS as [ExerciseType, ...ExerciseType[]]),
    category: z.string().max(100).nullable(),
    level: z.string().max(100).nullable(),
    equipment: z.array(z.string().max(100)).max(20),
    primaryMuscles: z.array(z.enum(MUSCLE_IDS as [MuscleId, ...MuscleId[]])).max(17),
    secondaryMuscles: z.array(z.enum(MUSCLE_IDS as [MuscleId, ...MuscleId[]])).max(17),
    instructions: z.array(z.string().max(2000)).max(50),
    mediaIds: z.array(mediaId).max(10),
  }),
  workouts: z.object({
    ...base,
    sport: z.enum(SPORTS),
    name: z.string().min(1).max(200),
    note: z.string().max(5000).nullable(),
    position: z.number().int(),
  }),
  workoutItems: z.object({
    ...base,
    workoutId: id,
    exerciseId: id,
    position: z.number().int(),
    mode: z.enum(['simple', 'per_set']),
    supersetGroup: id.nullable(),
    targets: z.array(setTarget).max(100),
    note: z.string().max(5000).nullable(),
  }),
  sessions: z.object({
    ...base,
    workoutId: id.nullable(),
    sport: z.enum(SPORTS),
    name: z.string().min(1).max(200),
    startedAt: ts,
    endedAt: ts.nullable(),
    note: z.string().max(5000).nullable(),
  }),
  setLogs: z.object({
    ...base,
    sessionId: id,
    exerciseId: id,
    workoutItemId: id.nullable(),
    position: z.number().int(),
    setIndex: z.number().int().nonnegative(),
    kind: z.enum(SET_KINDS),
    reps: z.number().int().nonnegative().optional(),
    weightG: z.number().int().nonnegative().optional(),
    durationS: z.number().nonnegative().optional(),
    distanceM: z.number().nonnegative().optional(),
    completedAt: ts,
  }),
  userSettings: z.object({
    ...base,
    key: z.enum(['appearance']),
    value: z.unknown(),
  }),
} as const;

export type PushTable = keyof typeof wireSchemas;
export const PUSH_TABLES = Object.keys(wireSchemas) as PushTable[];
export type WireRow<T extends PushTable> = z.infer<(typeof wireSchemas)[T]>;

// Exercises as pulled: ready-to-use media URLs, and whether this user changed a built-in one.
export type WireExercise = WireRow<'exercises'> & { mediaUrls: string[]; customized: boolean };

export type SyncChanges = { [T in Exclude<PushTable, 'exercises'>]?: WireRow<T>[] } & { exercises?: WireExercise[] };

export const syncRequest = z.object({
  // Highest server revision this device has already applied (0 = nothing yet).
  since: z.number().int().nonnegative(),
  changes: z.object(Object.fromEntries(PUSH_TABLES.map((t) => [t, z.array(z.unknown()).max(5000).optional()]))),
});

export interface SyncResponse {
  // Revision to send as `since` next time.
  rev: number;
  // More rows are waiting: call again with `since: rev` (and no changes).
  hasMore: boolean;
  // Rows still waiting after this page (0 when hasMore is false), for a progress display.
  remaining: number;
  changes: SyncChanges;
  // Pushed rows the server could not store (invalid, or pointing at a missing row); kept dirty on the device.
  rejected: { table: PushTable; id: string; reason: string }[];
}
