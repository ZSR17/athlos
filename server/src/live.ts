import { EventEmitter } from 'node:events';

// "Validate the set" from the watch (iOS Shortcut). The session itself lives on the phone, which may
// be locked: the phone publishes what comes next (labels and rests of the upcoming sets), the
// server answers the watch right away from it, starts the end-of-rest reminder, and queues the
// action until the app applies it (at once if open, else when it comes back to the foreground).
// Kept in memory: after a server restart the app publishes its context again on its next change.

interface LiveStep {
  label: string;
  restS: number;
}

interface LiveContext {
  deviceId: string;
  steps: LiveStep[];
}

interface LiveAction {
  id: string;
  at: number;
}

// Emits 'action' (userId) when an action is queued, so the open app applies it at once.
export const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(0);

// Older actions are dropped: a tap forgotten in the queue must not validate a set an hour later.
const ACTION_TTL_MS = 30 * 60 * 1000;

export class LiveSessions {
  private contexts = new Map<string, LiveContext>();
  private queues = new Map<string, LiveAction[]>();

  publish(userId: string, deviceId: string, steps: LiveStep[]): void {
    this.contexts.set(userId, { deviceId, steps });
  }

  // Session finished or abandoned: pending taps no longer mean anything.
  clear(userId: string): void {
    this.contexts.delete(userId);
    this.queues.delete(userId);
  }

  // Validates the next set; null when no session is going on.
  act(userId: string, now = Date.now()): { action: LiveAction; done: LiveStep; next: LiveStep | null; deviceId: string } | null {
    const context = this.contexts.get(userId);
    const done = context?.steps.shift();
    if (!context || !done) return null;
    const action = { id: crypto.randomUUID(), at: now };
    this.queues.set(userId, [...this.pending(userId, now), action]);
    liveEvents.emit('action', userId);
    return { action, done, next: context.steps[0] ?? null, deviceId: context.deviceId };
  }

  // Hands the queued actions over to the app (once).
  take(userId: string, now = Date.now()): LiveAction[] {
    const actions = this.pending(userId, now);
    this.queues.delete(userId);
    return actions;
  }

  private pending(userId: string, now: number): LiveAction[] {
    return (this.queues.get(userId) ?? []).filter((a) => now - a.at < ACTION_TTL_MS);
  }
}
