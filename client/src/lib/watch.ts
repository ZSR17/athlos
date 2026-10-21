import { type AthlosDb, db as defaultDb } from '../db/db.ts';
import { type LiveState, doneKeys, getLive, logSet, previousPerformance, sessionLogs } from '../db/sessions.ts';
import { api } from './api.ts';
import { buildSteps, nextOpenStep, prefill, restAfter, stepKey, stepLabel } from './session.ts';
import { createStore } from './store.ts';

// "Validate the set" from the Apple Watch, through an iOS Shortcut calling the server. The phone
// publishes the sets to come, the server answers the watch and queues the taps, and the app applies
// them here with the values shown on screen for that set (last time's, else the plan's).
export const watchSettings = createStore<{ enabled: boolean }>({ enabled: false }, 'athlos.watch');

interface LiveStep {
  label: string;
  restS: number;
}

// The open sets from the current one, in the order the watch will validate them.
async function upcomingSteps(live: LiveState, db: AthlosDb): Promise<LiveStep[]> {
  const steps = buildSteps(live.plan, live.extra);
  const done = doneKeys(await sessionLogs(live.sessionId, db));
  const names = new Map(
    (await db.exercises.bulkGet(live.plan.map((p) => p.exerciseId))).filter((e) => e !== undefined).map((e) => [e.id, e.name]),
  );
  const result: LiveStep[] = [];
  for (let i = live.cursor; i !== -1 && steps[i] && result.length < 200; ) {
    const step = steps[i]!;
    done.add(stepKey(live.plan, step));
    const next = nextOpenStep(live.plan, steps, done, i);
    result.push({
      label: stepLabel(live.plan, step, names.get(live.plan[step.item]!.exerciseId) ?? 'Exercice'),
      restS: next === -1 ? 0 : restAfter(live.plan, steps, i),
    });
    i = next;
  }
  return result;
}

// Called whenever the session moves on; offline it fails silently (the watch cannot reach the
// server either).
export async function publishLive(db: AthlosDb = defaultDb): Promise<void> {
  if (!watchSettings.get().enabled) return;
  const live = await getLive(db);
  const steps = live ? await upcomingSteps(live, db) : [];
  await api('/live', { method: 'PUT', body: JSON.stringify({ steps }) }).catch(() => undefined);
}

export function endLive(): void {
  if (watchSettings.get().enabled) void api('/live', { method: 'DELETE' }).catch(() => undefined);
}

let applying: Promise<void> | null = null;

// Applies the taps queued on the server (the app was told by the event stream, or comes back to
// the foreground). Only the device running a session takes them.
export function applyWatchActions(db: AthlosDb = defaultDb): Promise<void> {
  applying ??= (async () => {
    try {
      if (!watchSettings.get().enabled || !(await getLive(db))) return;
      const { actions } = await api<{ actions: { id: string; at: number }[] }>('/live/actions/take', { method: 'POST' });
      for (const action of actions) {
        const live = await getLive(db);
        const step = live && buildSteps(live.plan, live.extra)[live.cursor];
        if (!live || !step) break;
        const previous = await previousPerformance(live.plan[step.item]!.exerciseId, live.sessionId, db);
        await logSet(live, live.cursor, prefill(step.target, previous.get(step.set)), db, action.at);
      }
      if (actions.length) await publishLive(db);
    } catch {
      // Offline: the taps stay queued on the server.
    } finally {
      applying = null;
    }
  })();
  return applying;
}
