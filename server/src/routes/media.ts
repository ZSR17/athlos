import { type Crop, MAX_UPLOAD_BYTES, type UploadResponse, crop, mediaUrl } from '@athlos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { ImageFetchError, fetchImage } from '../lib/fetch-image.ts';
import { TranscoderUnavailable, UnsupportedMedia, storeUpload } from '../lib/media.ts';
import { storageUsage } from '../storage.ts';

const fromUrlBody = z.object({ url: z.string().trim().min(1).max(2000), crop: crop.optional() });

// Upload crop as `?crop=x,y,w,h` (the body is the file itself).
const cropQuery = z.object({
  crop: z
    .string()
    .transform((s) => s.split(',').map(Number))
    .pipe(z.tuple([z.number(), z.number(), z.number(), z.number()]))
    .transform(([x, y, w, h]) => ({ x, y, w, h }))
    .pipe(crop)
    .optional(),
});

const FETCH_STATUS = { invalid_url: 400, fetch_failed: 502, not_an_image: 415, too_large: 413 } as const;

// Uploads take the raw file as the request body (Content-Type: the file's type), no multipart.
export function mediaRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }) {
  app.addContentTypeParser(/^(image|video)\//, { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  const store = async (request: FastifyRequest, reply: FastifyReply, data: Buffer, mime: string, cropTo?: Crop) => {
    try {
      const ids = await storeUpload(db, config.dataDir, data, mime, config, cropTo);
      // storeUpload returns [image] or [video, poster image].
      const res: UploadResponse = {
        ids,
        urls: ids.map((id, i) => mediaUrl(id, ids.length === 2 && i === 0 ? 'video/mp4' : 'image/webp')),
      };
      return res;
    } catch (err) {
      if (err instanceof UnsupportedMedia) return reply.code(415).send({ error: 'unsupported_media' });
      if (err instanceof TranscoderUnavailable) {
        request.log.error('ffmpeg/ffprobe not found: set FFMPEG_PATH and FFPROBE_PATH');
        return reply.code(503).send({ error: 'video_unavailable' });
      }
      throw err;
    }
  };

  app.post('/media', async (request, reply) => {
    const mime = String(request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!(request.body instanceof Buffer) || !request.body.length) return reply.code(415).send({ error: 'unsupported_media' });
    const query = cropQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_crop' });
    return store(request, reply, request.body, mime, query.data.crop);
  });

  // A picture from a link: the server downloads it, then stores it like an upload.
  app.post('/media/from-url', async (request, reply) => {
    const body = fromUrlBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_url' });
    try {
      const { data, mime } = await fetchImage(body.data.url);
      return await store(request, reply, data, mime, body.data.crop);
    } catch (err) {
      if (err instanceof ImageFetchError) return reply.code(FETCH_STATUS[err.reason]).send({ error: err.reason });
      throw err;
    }
  });

  app.get('/storage', async () => storageUsage(db, config.dataDir));
}
