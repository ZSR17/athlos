import { useEffect, useState } from 'react';
import { createStore } from './store.ts';

// Per-device end-of-rest beep. Volume is relative to the phone's media volume (0.1 to 1).
export const soundSettings = createStore<{ volume: number }>({ volume: 0.4 }, 'athlos.sound');

// iOS only lets a page play sound after a user gesture: unlockAudio() is called from the
// "Valider" / "Démarrer" taps so the end-of-rest beep can play later without a tap.
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    // iOS only really unlocks the context once a sound has started inside the tap: play one
    // silent sample.
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, 22050);
    silent.connect(ctx.destination);
    silent.start(0);
  } catch {
    ctx = null;
  }
}

export function beep(times = 3): void {
  if (!ctx) return;
  const { volume } = soundSettings.get();
  // iOS pauses ("interrupted") the context after a while or when another app takes the audio.
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  const start = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = i === times - 1 ? 1320 : 880;
    const t = start + i * 0.28;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.min(1, Math.max(0.05, volume)), t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }
}

// From a tap (settings): unlocks the sound and plays the end-of-rest beep.
export function testBeep(): void {
  unlockAudio();
  beep();
}

// Android only: Safari on iPhone has no Vibration API, and iOS answers the "switch" haptic trick
// only to a real finger tap, never at the end of a timer.
export function vibrate(): void {
  navigator.vibrate?.([200, 100, 200, 100, 200]);
}

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Keeps the screen on during a session. The lock is dropped by the browser when the app is
// hidden, so it is requested again when it comes back.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        // Denied (low battery, not visible…): the session still works.
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void request();
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}
