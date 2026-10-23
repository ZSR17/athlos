import { useEffect, useRef, useState } from 'react';
import { beep, unlockAudio, useNow } from '../lib/feedback.ts';
import { formatDuration } from '../lib/format.ts';
import { Ring } from './Ring.tsx';

// Countdown to the planned duration, or a free stopwatch. Reports the elapsed seconds to the
// parent while running so "Valider" always records what was actually held.
export function Chrono({ targetS, onChange }: { targetS: number | undefined; onChange: (seconds: number) => void }) {
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>(targetS ? 'countdown' : 'stopwatch');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accMs, setAccMs] = useState(0);
  const now = useNow(200);
  const finished = useRef(false);

  const running = startedAt !== null;
  const elapsedMs = accMs + (running ? now - startedAt : 0);
  const elapsedS = Math.floor(elapsedMs / 1000);
  const countdown = mode === 'countdown' && !!targetS;
  const shownS = countdown ? Math.max(0, targetS - elapsedS) : elapsedS;
  const progress = countdown ? Math.min(1, elapsedMs / (targetS * 1000)) : (elapsedMs % 60000) / 60000;

  useEffect(() => {
    if (running) onChange(countdown ? Math.min(elapsedS, targetS) : elapsedS);
  }, [elapsedS, running, countdown, targetS, onChange]);

  useEffect(() => {
    if (countdown && running && elapsedS >= targetS && !finished.current) {
      finished.current = true;
      setAccMs(targetS * 1000);
      setStartedAt(null);
      onChange(targetS);
      beep();
    }
  }, [countdown, running, elapsedS, targetS, onChange]);

  const toggle = () => {
    unlockAudio();
    if (running) {
      setAccMs(elapsedMs);
      setStartedAt(null);
    } else {
      finished.current = false;
      if (countdown && elapsedS >= targetS) setAccMs(0);
      setStartedAt(Date.now());
    }
  };
  const reset = () => {
    finished.current = false;
    setStartedAt(null);
    setAccMs(0);
  };

  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      {targetS ? (
        <div className="seg" role="group" aria-label="Mode du chrono" style={{ width: '100%', background: 'var(--surface)' }}>
          <button type="button" aria-pressed={mode === 'countdown'} onClick={() => (reset(), setMode('countdown'))}>
            Compte à rebours
          </button>
          <button type="button" aria-pressed={mode === 'stopwatch'} onClick={() => (reset(), setMode('stopwatch'))}>
            Chrono libre
          </button>
        </div>
      ) : null}
      <Ring size={220} progress={progress} color="var(--time)">
        <span className="num" style={{ fontSize: 72, lineHeight: 1 }} aria-live="off">
          {formatDuration(shownS)}
        </span>
        <span className="small muted">{countdown ? `restant · objectif ${formatDuration(targetS)}` : 'écoulé'}</span>
      </Ring>
      <div className="row" style={{ width: '100%' }}>
        <button type="button" className="icon-btn" style={{ width: 60, height: 60 }} onClick={reset} aria-label="Remettre le chrono à zéro">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" />
          </svg>
        </button>
        <button type="button" className="btn grow" style={{ minHeight: 60, background: 'var(--time)', color: '#0E1012', borderColor: 'transparent' }} onClick={toggle}>
          {running ? 'Pause' : elapsedMs > 0 ? 'Reprendre' : 'Démarrer le chrono'}
        </button>
      </div>
    </div>
  );
}
