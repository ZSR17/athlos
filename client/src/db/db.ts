import type { ExerciseType, MuscleId, SetKind, SetTarget, Sport } from '@halko/shared';
import Dexie, { type EntityTable } from 'dexie';
import type { ItemMode } from '../lib/targets.ts';

// Local copies mirror the server tables so the sync (phase 4) can push/pull rows as-is.
// `dirty` marks rows changed on this device and not yet pushed; booleans are 0/1 so they can be indexed.
interface SyncedRow {
  id: string;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

// Built-in exercises edited here, and custom ones, are pushed like other rows (`dirty`).
export interface LocalExercise {
  id: string;
  source: 'builtin' | 'custom';
  name: string;
  sport: Sport;
  exerciseType: ExerciseType;
  category: string | null;
  level: string | null;
  equipment: string[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  instructions: string[];
  mediaIds: string[];
  mediaUrls: string[];
  // A built-in exercise this user changed (it can go back to the original).
  customized: boolean;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

export interface LocalWorkout extends SyncedRow {
  sport: Sport;
  name: string;
  note: string | null;
  position: number;
}

export interface LocalWorkoutItem extends SyncedRow {
  workoutId: string;
  exerciseId: string;
  position: number;
  mode: ItemMode;
  supersetGroup: string | null;
  targets: SetTarget[];
  note: string | null;
}

export interface LocalSession extends SyncedRow {
  workoutId: string | null;
  sport: Sport;
  name: string;
  startedAt: number;
  endedAt: number | null;
  note: string | null;
}

export interface LocalSetLog extends SyncedRow {
  sessionId: string;
  exerciseId: string;
  workoutItemId: string | null;
  // Order of the exercise in the session, and of the set within the exercise (warm-ups included).
  position: number;
  setIndex: number;
  kind: SetKind;
  reps?: number;
  weightG?: number;
  durationS?: number;
  distanceM?: number;
  completedAt: number;
}

interface MetaRow {
  key: string;
  value: unknown;
}

export class HalkoDb extends Dexie {
  exercises!: EntityTable<LocalExercise, 'id'>;
  workouts!: EntityTable<LocalWorkout, 'id'>;
  workoutItems!: EntityTable<LocalWorkoutItem, 'id'>;
  sessions!: EntityTable<LocalSession, 'id'>;
  setLogs!: EntityTable<LocalSetLog, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'halko') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, *primaryMuscles, *secondaryMuscles, source',
      workouts: 'id, position, deleted, dirty',
      workoutItems: 'id, workoutId, [workoutId+position], exerciseId, dirty',
      meta: 'key',
    });
    this.version(2).stores({
      sessions: 'id, startedAt, endedAt, dirty',
      setLogs: 'id, sessionId, [exerciseId+completedAt], dirty',
    });
    this.version(3)
      .stores({ exercises: 'id, name, *primaryMuscles, *secondaryMuscles, source, dirty' })
      .upgrade((tx) =>
        tx
          .table('exercises')
          .toCollection()
          .modify((e: LocalExercise) => {
            e.mediaIds = e.mediaUrls.map((u) => /([0-9a-f]{64})/.exec(u)?.[1] ?? '').filter(Boolean);
            e.customized = false;
            e.createdAt = e.updatedAt;
            e.deleted = 0;
            e.dirty = 0;
          }),
      );
  }
}

export const db = new HalkoDb();
