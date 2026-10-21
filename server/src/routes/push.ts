import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { type RestReminders, isSubscribed, removeSubscriptions, saveSubscription, vapidKeys } from '../push.ts';

const subscriptionBody = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

const restBody = z.object({
  // Delay rather than a date: the phone's and the server's clocks may differ.
  inMs: z.number().int().min(0).max(30 * 60 * 1000),
  body: z.string().max(200).optional(),
});

// End-of-rest notifications (Web Push). The device subscribes once, then asks for a reminder at
// each rest; a new rest replaces the pending reminder, skipping the rest cancels it.
export function pushRoutes(app: FastifyInstance, { db, reminders }: { db: Db; reminders: RestReminders }) {
  app.get('/push/key', async () => ({ publicKey: vapidKeys(db).publicKey }));

  app.get('/push/subscription', async (request) => ({ subscribed: isSubscribed(db, request.auth!.deviceId) }));

  app.put('/push/subscription', async (request, reply) => {
    const body = subscriptionBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    saveSubscription(db, request.auth!.deviceId, body.data);
    return { subscribed: true };
  });

  app.delete('/push/subscription', async (request) => {
    reminders.cancel(request.auth!.deviceId);
    removeSubscriptions(db, request.auth!.deviceId);
    return { subscribed: false };
  });

  app.put('/push/rest', async (request, reply) => {
    const body = restBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const { deviceId } = request.auth!;
    reminders.schedule(deviceId, body.data.inMs, {
      title: 'Repos terminé',
      body: body.data.body ?? 'À toi : série suivante.',
      tag: 'athlos-rest',
      url: '/seance',
    });
    return { scheduled: isSubscribed(db, deviceId) };
  });

  app.delete('/push/rest', async (request) => {
    reminders.cancel(request.auth!.deviceId);
    return { ok: true };
  });
}
