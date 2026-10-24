import { type Crop, MAX_UPLOAD_BYTES, type UploadResponse } from '@halko/shared';
import { ApiError, api } from '../lib/api.ts';
import { syncNow } from '../sync/engine.ts';
import { type HalkoDb, type LocalExercise, db as defaultDb } from './db.ts';

export type ExerciseFields = Pick<
  LocalExercise,
  'name' | 'exerciseType' | 'equipment' | 'primaryMuscles' | 'secondaryMuscles' | 'instructions' | 'mediaIds' | 'mediaUrls'
>;

export async function createExercise(fields: ExerciseFields, db: HalkoDb = defaultDb): Promise<string> {
  const id = crypto.randomUUID();
  const t = Date.now();
  await db.exercises.add({
    id,
    source: 'custom',
    sport: 'strength',
    category: null,
    level: null,
    ...fields,
    name: fields.name.trim(),
    customized: false,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    dirty: 1,
  });
  return id;
}

// Editing a built-in exercise makes it this user's version (kept on the server, on every device).
export async function updateExercise(id: string, fields: ExerciseFields, db: HalkoDb = defaultDb): Promise<void> {
  const existing = await db.exercises.get(id);
  if (!existing) throw new Error('exercise not found');
  await db.exercises.update(id, {
    ...fields,
    name: fields.name.trim(),
    customized: existing.source === 'builtin',
    updatedAt: Date.now(),
    dirty: 1,
  });
}

// Only custom exercises can be deleted; they stay in past sessions.
export async function deleteExercise(id: string, db: HalkoDb = defaultDb): Promise<void> {
  await db.exercises.update(id, { deleted: 1, updatedAt: Date.now(), dirty: 1 });
}

// Back to the library's version of a built-in exercise. Needs the server.
export async function resetExercise(id: string): Promise<void> {
  await syncNow();
  await api(`/exercises/${id}/override`, { method: 'DELETE' }).catch((err) => {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  });
  await syncNow();
}

export class UploadError extends Error {}

const UPLOAD_ERRORS: Record<number, string> = {
  413: 'Fichier trop lourd (100 Mo maximum).',
  415: 'Format non reconnu : choisis une photo, un GIF ou une vidéo.',
  503: 'Le serveur ne sait pas encore convertir les vidéos.',
};

const LINK_ERRORS: Record<number, string> = {
  400: 'Lien invalide : colle l’adresse complète (https://…).',
  413: 'Fichier trop lourd (20 Mo pour une image, 100 Mo pour un GIF ou une vidéo).',
  415: 'Ce lien ne mène pas à une image, un GIF ou une vidéo : ouvre-la seule, puis copie son adresse (une page comme YouTube ne marche pas).',
  502: 'Rien de trouvé à cette adresse.',
  503: UPLOAD_ERRORS[503]!,
};

async function fromUrl(body: { url: string; crop?: Crop; frameFirst?: boolean }): Promise<UploadResponse | null> {
  try {
    return await api<UploadResponse>('/media/from-url', { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'needs_framing') return null;
    if (err instanceof ApiError) throw new UploadError(LINK_ERRORS[err.status] ?? 'Import refusé par le serveur.');
    throw new UploadError('Serveur injoignable : il faut être connecté pour importer depuis un lien.');
  }
}

// Asks the server to download a GIF or video from a link and keep it. Null when the link is a still photo:
// it is not kept yet, to be framed first, then sent with importMediaFromUrl.
export const importMotionFromUrl = (url: string) => fromUrl({ url, frameFirst: true });

// Asks the server to download a picture from a link and keep it (only `crop` of it), like an uploaded photo.
export async function importMediaFromUrl(url: string, crop?: Crop): Promise<UploadResponse> {
  return (await fromUrl({ url, crop }))!;
}

// Sends a photo, GIF or video to the server, which compresses it (and keeps only `crop` of a photo).
export async function uploadMedia(file: File, crop?: Crop): Promise<UploadResponse> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(UPLOAD_ERRORS[413]);
  const query = crop ? `?crop=${[crop.x, crop.y, crop.w, crop.h].join(',')}` : '';
  try {
    return await api<UploadResponse>(`/media${query}`, {
      method: 'POST',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    });
  } catch (err) {
    if (err instanceof ApiError) throw new UploadError(UPLOAD_ERRORS[err.status] ?? 'Envoi refusé par le serveur.');
    throw new UploadError('Serveur injoignable : il faut être connecté pour ajouter une photo ou une vidéo.');
  }
}
