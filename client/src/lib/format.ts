// Display / input helpers. Storage units are grams, seconds and metres (see shared/domain.ts).
import { EXERCISE_TYPES, type ExerciseType } from '@halko/shared';

function trimNumber(n: number, decimals: number): string {
  return Number(n.toFixed(decimals)).toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}

function parseDecimal(input: string): number | null {
  const n = Number(input.trim().replace(',', '.'));
  return input.trim() === '' || Number.isNaN(n) ? null : n;
}

export function formatKg(grams: number | undefined): string {
  return grams === undefined ? '' : trimNumber(grams / 1000, 2);
}

export function parseKg(input: string): number | null {
  const kg = parseDecimal(input);
  return kg === null || kg < 0 ? null : Math.round(kg * 1000);
}

export function formatKm(metres: number | undefined): string {
  return metres === undefined ? '' : trimNumber(metres / 1000, 2);
}

export function parseKm(input: string): number | null {
  const km = parseDecimal(input);
  return km === null || km < 0 ? null : Math.round(km * 1000);
}

// 75 -> "1:15", 3725 -> "1:02:05"
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// "1:30" or, typed like a timer keypad without the colon: up to 2 digits are seconds ("25", "90"),
// beyond that the last two digits are the seconds ("130" = 1:30, "1000" = 10:00, "13000" = 1:30:00).
export function parseDuration(input: string): number | null {
  const text = input.trim();
  const parts = /^\d{3,6}$/.test(text) ? text.padStart(6, '0').match(/\d\d/g)! : text.split(':');
  if (parts.some((p) => !/^\d+$/.test(p)) || parts.length > 3) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

// Short distances (carries, sled) read better in metres.
function formatDistance(metres: number | undefined): string {
  if (metres === undefined) return '';
  return metres < 1000 ? `${Math.round(metres)} m` : `${formatKm(metres)} km`;
}

// "80 kg × 8", "+10 kg × 6", "12 reps", "1:00", "5,2 km · 25:00", "24 kg · 40 m"
export function formatSetValues(
  type: ExerciseType,
  v: { reps?: number; weightG?: number; durationS?: number; distanceM?: number },
): string {
  const metrics = EXERCISE_TYPES[type].metrics as readonly string[];
  const sign = type === 'weighted_bw' ? '+' : type === 'assisted_bw' ? '−' : '';
  const weight = metrics.includes('weight') && v.weightG !== undefined ? `${sign}${formatKg(v.weightG)} kg` : null;
  if (metrics.includes('reps')) return weight ? `${weight} × ${v.reps ?? 0}` : `${v.reps ?? 0} reps`;
  return [
    weight,
    metrics.includes('distance') ? formatDistance(v.distanceM) : null,
    metrics.includes('duration') ? formatDuration(v.durationS) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function parseCount(input: string): number | null {
  return /^\d+$/.test(input.trim()) ? Number(input.trim()) : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0).replace('.', ',')} Mo`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
}
