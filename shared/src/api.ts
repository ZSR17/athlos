import { z } from 'zod';

export const API_PREFIX = '/api/v1';

export const loginBody = z.object({
  password: z.string().min(1).max(200),
  deviceName: z.string().min(1).max(80),
});
export type LoginBody = z.infer<typeof loginBody>;

export interface LoginResponse {
  token: string;
  deviceId: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
}

// Upload limit for photos, GIFs and videos (they are compressed on the server).
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export interface UploadResponse {
  // Media to append to an exercise: [image] for a photo, [video, poster image] for a GIF or video.
  ids: string[];
  urls: string[];
}

export interface StorageResponse {
  media: { files: number; bytes: number };
  databaseBytes: number;
}

// Server-side media URL: images are WebP, animations and videos MP4.
export function mediaUrl(id: string, mime: string): string {
  return `/media/${id}.${mime === 'video/mp4' ? 'mp4' : 'webp'}`;
}
