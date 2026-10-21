import { api } from './api.ts';
import { createStore } from './store.ts';

// End-of-rest notifications (Web Push): the server sends them, so they arrive with the screen
// locked, in silent mode (vibration) and on the watch. Needs the network; the beep still works
// without it. On iPhone, only for the app added to the home screen.
export const pushSettings = createStore<{ enabled: boolean }>({ enabled: false }, 'athlos.push');

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushState(): PushState {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return pushSettings.get().enabled && Notification.permission === 'granted' ? 'on' : 'off';
}

// The server's public key, in the format PushManager expects.
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// From a tap: iOS only shows the permission prompt during a user gesture, so it is asked first.
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return pushState();
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/push/key');
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await api('/push/subscription', { method: 'PUT', body: JSON.stringify(subscription.toJSON()) });
  pushSettings.set({ enabled: true });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  pushSettings.set({ enabled: false });
  const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  await subscription?.unsubscribe();
  await api('/push/subscription', { method: 'DELETE' }).catch(() => undefined);
  return pushState();
}

// Asks the server for a notification in `inMs` (a new rest replaces the pending one), or cancels it.
// Resolves with whether the server holds a subscription for this device ('offline' when unreachable:
// the beep is still there).
export async function remindRestEnd(inMs: number | null, body?: string): Promise<'scheduled' | 'unsubscribed' | 'offline' | 'off'> {
  if (!pushSettings.get().enabled) return 'off';
  try {
    if (inMs === null) {
      await api('/push/rest', { method: 'DELETE' });
      return 'scheduled';
    }
    const res = await api<{ scheduled: boolean }>('/push/rest', {
      method: 'PUT',
      body: JSON.stringify({ inMs: Math.max(0, Math.round(inMs)), body }),
    });
    return res.scheduled ? 'scheduled' : 'unsubscribed';
  } catch {
    return 'offline';
  }
}
