// Domain vocabulary shared by the server and the clients.
// Units stored everywhere: grams, metres, seconds; timestamps are epoch milliseconds (UTC).

export const SPORTS = ['strength', 'running', 'cycling', 'cardio', 'other'] as const;
export type Sport = (typeof SPORTS)[number];

export type Metric = 'reps' | 'weight' | 'duration' | 'distance';

export const EXERCISE_TYPES = {
  weight_reps: { label: 'Poids et Réps', metrics: ['reps', 'weight'] },
  bw_reps: { label: 'Réps poids du corps', metrics: ['reps'] },
  weighted_bw: { label: 'Poids du corps lesté', metrics: ['reps', 'weight'] },
  assisted_bw: { label: 'Poids du corps assisté', metrics: ['reps', 'weight'] },
  duration: { label: 'Durée', metrics: ['duration'] },
  duration_weight: { label: 'Durée et poids', metrics: ['weight', 'duration'] },
  distance_duration: { label: 'Distance et durée', metrics: ['duration', 'distance'] },
  weight_distance: { label: 'Poids et distance', metrics: ['weight', 'distance'] },
} as const satisfies Record<string, { label: string; metrics: readonly Metric[] }>;
export type ExerciseType = keyof typeof EXERCISE_TYPES;
export const EXERCISE_TYPE_IDS = Object.keys(EXERCISE_TYPES) as ExerciseType[];

// Same granularity as free-exercise-db; the body map groups some of them (lats + middleback).
export const MUSCLES = {
  abs: 'Abdos',
  abductors: 'Abducteurs',
  adductors: 'Adducteurs',
  biceps: 'Biceps',
  calves: 'Mollets',
  chest: 'Pectoraux',
  forearms: 'Avant-bras',
  glutes: 'Fessiers',
  hamstrings: 'Ischios',
  lats: 'Grand dorsal',
  lowerback: 'Lombaires',
  middleback: 'Milieu du dos',
  neck: 'Cou',
  quads: 'Quadriceps',
  shoulders: 'Épaules',
  traps: 'Trapèzes',
  triceps: 'Triceps',
} as const;
export type MuscleId = keyof typeof MUSCLES;
export const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];

// Coarse groups used by the library filters.
export const MUSCLE_GROUPS = [
  { id: 'legs', label: 'Jambes', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] },
  { id: 'chest', label: 'Pecs', muscles: ['chest'] },
  { id: 'back', label: 'Dos', muscles: ['lats', 'middleback', 'lowerback', 'traps'] },
  { id: 'core', label: 'Abdos', muscles: ['abs'] },
  { id: 'arms', label: 'Bras', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'shoulders', label: 'Épaules', muscles: ['shoulders', 'neck'] },
] as const satisfies readonly { id: string; label: string; muscles: readonly MuscleId[] }[];

export const EQUIPMENT_LABELS: Record<string, string> = {
  'body only': 'Poids du corps',
  barbell: 'Barre',
  dumbbell: 'Haltères',
  kettlebells: 'Kettlebell',
  cable: 'Poulie',
  machine: 'Machine',
  bands: 'Élastiques',
  'medicine ball': 'Médecine-ball',
  'exercise ball': 'Swiss ball',
  'e-z curl bar': 'Barre EZ',
  'foam roll': 'Rouleau',
  other: 'Autre',
};

export const SET_KINDS =['warmup', 'normal', 'drop', 'failure'] as const;
export type SetKind = (typeof SET_KINDS)[number];

// Colours are kept per device. A device with appearance sync turned on follows (and writes) the
// shared "appearance" user setting instead of its local copy.
export interface Appearance {
  theme: 'dark' | 'light' | 'auto';
  accent: string;
  musclePrimary: string;
  muscleSecondary: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark',
  accent: '#D4FF3A',
  musclePrimary: '#FF4D2E',
  muscleSecondary: '#FFD166',
};

// Synced per-user settings, stored as JSON values under these keys.
export interface UserSettings {
  appearance: Appearance;
}
export type UserSettingKey = keyof UserSettings;

// One planned set inside a workout item. Simple mode just repeats identical targets.
export interface SetTarget {
  kind: SetKind;
  reps?: number;
  weightG?: number;
  durationS?: number;
  distanceM?: number;
  restS?: number;
}
