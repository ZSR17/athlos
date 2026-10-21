import webpush from 'web-push';
import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from './db/index.ts';
import { devices, meta, pushSubscriptions } from './db/schema.ts';

interface PushMessage {
  title: string;
  body: string;
  // Same tag: a new notification replaces the previous one instead of piling up.
  tag: string;
  url: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Sends one encrypted message; resolves with the push service's answer (status 0: not reached).
export type PushSender = (target: PushTarget, payload: string) => Promise<{ status: number; detail: string }>;

type Log = Pick<FastifyBaseLogger, 'info' | 'warn'>;

// VAPID keys identify this server to Apple / Google push services. Created on first use and kept in
// the database (the private key never leaves the server).
export function vapidKeys(db: Db): { publicKey: string; privateKey: string } {
  const row = db.select().from(meta).where(eq(meta.key, 'vapid')).get();
  if (row) return JSON.parse(row.value) as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  db.insert(meta).values({ key: 'vapid', value: JSON.stringify(keys) }).onConflictDoNothing().run();
  return vapidKeys(db);
}

export function webPushSender(db: Db, subject: string): PushSender {
  const { publicKey, privateKey } = vapidKeys(db);
  return async (target, payload) => {
    try {
      const res = await webpush.sendNotification(target, payload, {
        TTL: 120,
        urgency: 'high',
        vapidDetails: { subject, publicKey, privateKey },
      });
      return { status: res.statusCode, detail: res.body };
    } catch (err) {
      const e = err as { statusCode?: number; body?: string; message?: string };
      return { status: e.statusCode ?? 0, detail: e.body || e.message || '' };
    }
  };
}

export function saveSubscription(db: Db, deviceId: string, sub: PushTarget): void {
  const values = { deviceId, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  db.insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, createdAt: Date.now(), ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
    .run();
}

export function removeSubscriptions(db: Db, deviceId: string): void {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.deviceId, deviceId)).run();
}

export function isSubscribed(db: Db, deviceId: string): boolean {
  return !!db.select().from(pushSubscriptions).where(eq(pushSubscriptions.deviceId, deviceId)).get();
}

// Sends a message to every subscription of a device (not revoked); forgets the ones the push
// service reports as gone (404 / 410: app removed, permission withdrawn).
async function sendToDevice(db: Db, send: PushSender, log: Log, deviceId: string, message: PushMessage): Promise<number> {
  const subs = db
    .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .innerJoin(devices, eq(devices.id, pushSubscriptions.deviceId))
    .where(and(eq(pushSubscriptions.deviceId, deviceId), eq(devices.revoked, false)))
    .all();
  if (!subs.length) log.warn(`push: device ${deviceId} has no subscription, notification not sent`);
  let sent = 0;
  for (const s of subs) {
    const { status, detail } = await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message));
    const service = new URL(s.endpoint).host;
    if (status >= 200 && status < 300) {
      sent++;
      log.info(`push: notification sent to ${service} (${status})`);
    } else {
      log.warn(`push: ${service} refused the notification (${status || 'unreachable'}) ${detail}`.trim());
      if (status === 404 || status === 410) db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint)).run();
    }
  }
  return sent;
}

// End-of-rest reminders: one pending timer per device, replaced by every new rest. Kept in memory:
// a server restart during a rest only loses that one notification.
export class RestReminders {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly db: Db,
    private readonly send: PushSender,
    private readonly log: Log & Pick<FastifyBaseLogger, 'error'>,
  ) {}

  schedule(deviceId: string, inMs: number, message: PushMessage): void {
    this.cancel(deviceId);
    this.log.info(`push: rest reminder for device ${deviceId} in ${Math.round(inMs / 1000)} s`);
    this.timers.set(
      deviceId,
      setTimeout(() => {
        this.timers.delete(deviceId);
        sendToDevice(this.db, this.send, this.log, deviceId, message).catch((err) => this.log.error(err, 'push: sending failed'));
      }, inMs),
    );
  }

  cancel(deviceId: string): void {
    clearTimeout(this.timers.get(deviceId));
    this.timers.delete(deviceId);
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
