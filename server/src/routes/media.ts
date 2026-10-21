import { MAX_UPLOAD_BYTES, type UploadResponse, mediaUrl } from '@athlos/shared';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { TranscoderUnavailable, UnsupportedMedia, storeUpload } from '../lib/media.ts';
import { storageUsage } from '../storage.ts';

// Uploads take the raw file as the request body (Content-Type: the file's type), no multipart.
export function mediaRoutes(app: FastifyInstance, { db, config }: { db: Db; config: Config }) {
  app.addContentTypeParser(/^(image|video)\//, { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  app.post('/media', async (request, reply) => {
    const mime = String(request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!(request.body instanceof Buffer) || !request.body.length) return reply.code(415).send({ error: 'unsupported_media' });
    try {
      const ids = await storeUpload(db, config.dataDir, request.body, mime, config);
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
  });

  app.get('/storage', async () => storageUsage(db, config.dataDir));
}
