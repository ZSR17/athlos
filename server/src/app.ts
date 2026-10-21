import fs from 'node:fs';
import path from 'node:path';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { API_PREFIX, type HealthResponse, type NetworkResponse } from '@athlos/shared';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { authHook } from './auth.ts';
import type { Config } from './config.ts';
import type { Db } from './db/index.ts';
import { ipInCidrs } from './lib/ip.ts';
import { mediaDir, mediaRelPath } from './lib/media.ts';
import { authRoutes } from './routes/auth.ts';
import { exerciseRoutes } from './routes/exercises.ts';
import { mediaRoutes } from './routes/media.ts';
import { liveRoutes } from './routes/live.ts';
import { pushRoutes } from './routes/push.ts';
import { LiveSessions } from './live.ts';
import { type PushSender, RestReminders, webPushSender } from './push.ts';
import { syncRoutes } from './routes/sync.ts';

const VERSION = '0.1.0';

export interface AppDeps {
  config: Config;
  db: Db;
  ownerId: string;
  logger?: FastifyServerOptions['logger'];
  // Tests replace the real Web Push delivery.
  pushSender?: PushSender;
}

export async function buildApp({ config, db, ownerId, logger = false, pushSender }: AppDeps) {
  const app = Fastify({ logger, trustProxy: config.trustProxy });
  const reminders = new RestReminders(db, pushSender ?? webPushSender(db, config.pushSubject), app.log);
  app.addHook('onClose', async () => reminders.stop());
  const live = new LiveSessions();
  await app.register(rateLimit, { global: false });

  fs.mkdirSync(mediaDir(config.dataDir), { recursive: true });
  await app.register(fastifyStatic, { root: mediaDir(config.dataDir), serve: false });

  app.get('/api/health', async (): Promise<HealthResponse> => {
    db.$client.prepare('SELECT 1').get();
    return { ok: true, version: VERSION };
  });

  // Media is content-addressed (sha256 names) and never changes, so it is cached forever.
  // Left unauthenticated so <img>/<video> tags work; names are unguessable and the app is LAN/VPN only.
  app.get<{ Params: { file: string } }>('/media/:file', async (request, reply) => {
    const match = /^([0-9a-f]{64})\.(webp|mp4)$/.exec(request.params.file);
    if (!match) return reply.code(404).send({ error: 'not_found' });
    return reply.sendFile(mediaRelPath(match[1]!, match[2]!), { maxAge: '365d', immutable: true });
  });

  if (config.staticDir) {
    // The app itself. Its shell and service worker must always be revalidated so updates reach the
    // phones; hashed assets never change.
    await app.register(fastifyStatic, {
      root: config.staticDir,
      decorateReply: false,
      setHeaders: (res, file) => {
        const name = path.basename(file);
        if (name === 'index.html' || name === 'sw.js' || name.startsWith('workbox-') || name.endsWith('.webmanifest')) {
          res.header('cache-control', 'no-cache');
        } else if (file.includes(`${path.sep}assets${path.sep}`)) {
          res.header('cache-control', 'public, max-age=31536000, immutable');
        }
      },
    });
    // Client-side routes (/seances/..., /reglages) all load the app shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/') || request.url.startsWith('/media/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.header('cache-control', 'no-cache').sendFile('index.html', config.staticDir);
    });
  }

  await app.register(
    async (api) => {
      api.addHook('onRequest', authHook(db));
      authRoutes(api, { db, config, ownerId });
      exerciseRoutes(api, { db });
      mediaRoutes(api, { db, config });
      pushRoutes(api, { db, reminders });
      liveRoutes(api, { db, live, reminders });
      syncRoutes(api, { db });
      api.get('/network', async (request): Promise<NetworkResponse> => ({
        location: ipInCidrs(request.ip, config.homeCidrs) ? 'home' : 'remote',
      }));
    },
    { prefix: API_PREFIX },
  );

  return app;
}
