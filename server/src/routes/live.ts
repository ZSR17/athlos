import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createDevice } from '../auth.ts';
import type { Db } from '../db/index.ts';
import type { LiveSessions } from '../live.ts';
import type { RestReminders } from '../push.ts';

const contextBody = z.object({
  steps: z.array(z.object({ label: z.string().max(200), restS: z.number().int().min(0).max(3600) })).max(200),
});

const shortcutBody = z.object({ name: z.string().trim().min(1).max(60).default('Raccourci Apple Watch') });

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// "Validate the set" from the watch. The Shortcut uses its own device token (created from the
// Settings, revocable like any device) and shows the plain text answer on the watch.
export function liveRoutes(
  app: FastifyInstance,
  { db, live, reminders }: { db: Db; live: LiveSessions; reminders: RestReminders },
) {
  app.post('/devices/shortcut', async (request, reply) => {
    const body = shortcutBody.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    return createDevice(db, request.auth!.userId, body.data.name);
  });

  // The phone running the session publishes the sets to come (empty: no session).
  app.put('/live', async (request, reply) => {
    const body = contextBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const { userId, deviceId } = request.auth!;
    if (body.data.steps.length) live.publish(userId, deviceId, body.data.steps);
    else live.clear(userId);
    return { ok: true };
  });

  app.delete('/live', async (request) => {
    live.clear(request.auth!.userId);
    return { ok: true };
  });

  app.post('/live/actions', async (request, reply) => {
    const result = live.act(request.auth!.userId);
    reply.type('text/plain; charset=utf-8');
    if (!result) return reply.code(409).send('Aucune séance en cours sur le téléphone.');
    const { done, next, deviceId } = result;
    if (next && done.restS > 0) {
      reminders.schedule(deviceId, done.restS * 1000, { title: 'Repos terminé', body: next.label, tag: 'athlos-rest', url: '/seance' });
      return `✓ ${done.label}\nRepos ${clock(done.restS)}, puis ${next.label}`;
    }
    return next ? `✓ ${done.label}\nEnchaîne : ${next.label}` : `✓ ${done.label}\nPlus de série prévue : termine la séance sur le téléphone.`;
  });

  app.post('/live/actions/take', async (request) => ({ actions: live.take(request.auth!.userId) }));
}
