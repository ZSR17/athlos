import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap.tsx';
import { Chrono } from '../components/Chrono.tsx';
import { ExerciseMedia } from '../components/ExerciseMedia.tsx';
import { Icon } from '../components/Icon.tsx';
import { Ring } from '../components/Ring.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { SyncBadge } from '../components/SyncBadge.tsx';
import { requestSync } from '../sync/engine.ts';
import { db } from '../db/db.ts';
import {
  type LiveState,
  addExtraSet,
  cursorForItem,
  discardSession,
  doneKeys,
  finishSession,
  logSet,
  previousPerformance,
  sessionLogs,
  updateLive,
} from '../db/sessions.ts';
import { beep, unlockAudio, useNow } from '../lib/feedback.ts';
import { formatDuration, formatKg, formatKm, formatSetValues, parseCount, parseDuration, parseKg, parseKm } from '../lib/format.ts';
import { type SetValues, buildSteps, prefill, setCount, stepKey, targetFor, workingNumber } from '../lib/session.ts';
import { metricLabel, metricsFor } from '../lib/targets.ts';

const count = (v: number | undefined) => (v === undefined ? '' : String(v));

function elapsedLabel(ms: number): string {
  return formatDuration(Math.floor(ms / 1000));
}

export function LiveSession() {
  const navigate = useNavigate();
  const live = useLiveQuery(async () => ((await db.meta.get('live'))?.value as LiveState | undefined) ?? null, []);
  const session = useLiveQuery(() => (live ? db.sessions.get(live.sessionId) : undefined), [live?.sessionId]);
  const logs = useLiveQuery(() => (live ? sessionLogs(live.sessionId) : []), [live?.sessionId]);
  const exercises = useLiveQuery(async () => {
    if (!live) return new Map();
    const rows = await db.exercises.bulkGet(live.plan.map((p) => p.exerciseId));
    return new Map(rows.filter((r) => r !== undefined).map((r) => [r.id, r]));
  }, [live?.sessionId]);
  const now = useNow(250);
  const [finishing, setFinishing] = useState(false);

  const steps = useMemo(() => (live ? buildSteps(live.plan, live.extra) : []), [live]);
  const done = useMemo(() => doneKeys(logs ?? []), [logs]);
  const step = live ? steps[live.cursor] : undefined;
  const item = live && step ? live.plan[step.item] : undefined;
  const exercise = item ? exercises?.get(item.exerciseId) : undefined;
  const previous = useLiveQuery(
    () => (item && live ? previousPerformance(item.exerciseId, live.sessionId) : new Map<number, SetValues>()),
    [item?.exerciseId, live?.sessionId],
  );

  // Values being entered for the current set, reset whenever the current set changes.
  const [draft, setDraft] = useState<SetValues>({});
  const draftKey = live && step ? stepKey(live.plan, step) : '';
  const loggedForStep = logs?.find((l) => `${l.workoutItemId}:${l.setIndex}` === draftKey);
  useEffect(() => {
    if (!step) return;
    setDraft(loggedForStep ?? prefill(step.target, previous?.get(step.set)));
    // Only when the set changes: re-running on every log update would wipe what is being typed.
  }, [draftKey, previous]);
  const setField = useCallback((key: keyof SetValues, v: number) => setDraft((d) => (d[key] === v ? d : { ...d, [key]: v })), []);
  const setDuration = useCallback((s: number) => setField('durationS', s), [setField]);

  const setNumber = (set: number) => (item ? workingNumber(item, set) : set + 1);

  // End of rest: beep once, then close the rest screen.
  const beeped = useRef<number | null>(null);
  const resting = !!live?.restEndsAt && now < live.restEndsAt;
  useEffect(() => {
    if (live?.restEndsAt && now >= live.restEndsAt && beeped.current !== live.restEndsAt) {
      beeped.current = live.restEndsAt;
      beep();
      void updateLive({ restEndsAt: null });
    }
  }, [now, live?.restEndsAt]);

  if (live === undefined) return <div className="page muted">Chargement…</div>;
  if (live === null) {
    return (
      <div className="page">
        <p>Aucune séance en cours.</p>
        <Link to="/">Choisir une séance</Link>
      </div>
    );
  }

  const itemCount = live.plan.length;
  const allDone = steps.length > 0 && steps.every((s) => done.has(stepKey(live.plan, s)));
  const type = item?.exerciseType ?? 'weight_reps';
  const metrics = metricsFor(type);
  const itemSets = step ? Array.from({ length: setCount(live.plan, live.extra, step.item) }, (_, k) => k) : [];

  const validate = async () => {
    if (!step) return;
    unlockAudio();
    await logSet(live, live.cursor, draft);
  };
  const goToItem = (index: number) => {
    const c = cursorForItem(live, steps, done, index);
    if (c !== -1) void updateLive({ cursor: c });
  };
  const finish = async () => {
    const id = await finishSession();
    // With "sync at the end of the session" this is the moment everything goes.
    requestSync(0);
    navigate(id ? `/historique/${id}?fin=1` : '/');
  };

  // `now` ticks every 250 ms and can lag the moment the rest started: never show more than planned.
  const restLeft = resting ? Math.min(live.restTotalS, Math.ceil((live.restEndsAt! - now) / 1000)) : 0;
  const nextStep = steps[live.cursor];

  return (
    <div className="page live" style={{ maxWidth: 720 }}>
      <header className="row" style={{ gap: 10 }}>
        <Link to="/" className="icon-btn" aria-label="Quitter l'écran (la séance continue)">
          <Icon name="back" />
        </Link>
        <div className="grow stack" style={{ gap: 0, minWidth: 0 }}>
          <span className="ellipsis" style={{ fontWeight: 700 }}>
            {session?.name ?? 'Séance'}
          </span>
          <span className="small muted">
            Exercice {step ? step.item + 1 : itemCount} sur {itemCount} · {session ? elapsedLabel(now - session.startedAt) : ''}
          </span>
        </div>
        <span className="hide-narrow">
          <SyncBadge compact />
        </span>
        <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => setFinishing(true)}>
          Terminer
        </button>
      </header>

      <div className="progress" style={{ gridTemplateColumns: `repeat(${itemCount}, minmax(0, 1fr))` }} aria-hidden="true">
        {live.plan.map((p, k) => {
          const total = setCount(live.plan, live.extra, k);
          const doneCount = Array.from({ length: total }, (_, s) => done.has(`${p.itemId}:${s}`)).filter(Boolean).length;
          return <span key={p.itemId} className={doneCount === total ? 'full' : k === step?.item ? 'current' : ''} />;
        })}
      </div>

      {allDone ? (
        <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <h1 className="title-sm">Toutes les séries sont faites</h1>
          <p className="muted" style={{ margin: 0 }}>
            {logs?.length} séries en {session ? elapsedLabel(now - session.startedAt) : ''}.
          </p>
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={finish}>
            Terminer la séance
          </button>
        </div>
      ) : (
        step &&
        item && (
          <>
            <ExerciseMedia urls={exercise?.mediaUrls ?? []} name={exercise?.name ?? ''} style={{ height: 190, borderRadius: 20 }}>
              <div style={{ position: 'absolute', right: 8, bottom: 8, padding: 4, borderRadius: 10, background: 'var(--surface)' }}>
                <BodyMap primary={exercise?.primaryMuscles ?? []} secondary={exercise?.secondaryMuscles ?? []} height={78} legend={false} />
              </div>
            </ExerciseMedia>

            <div className="row" style={{ alignItems: 'flex-end' }}>
              <button type="button" className="icon-btn" disabled={step.item === 0} onClick={() => goToItem(step.item - 1)} aria-label="Exercice précédent">
                <Icon name="back" size={20} />
              </button>
              <div className="grow stack" style={{ gap: 2 }}>
                <h1 className="title-sm ellipsis">{exercise?.name}</h1>
                {item.supersetGroup && <span className="small" style={{ color: 'var(--superset)', fontWeight: 700 }}>Superset · enchaîner sans repos</span>}
              </div>
              <button type="button" className="icon-btn" disabled={step.item === itemCount - 1} onClick={() => goToItem(step.item + 1)} aria-label="Exercice suivant">
                <Icon name="chevron" size={20} />
              </button>
            </div>

            {item.note && (
              <div className="row small" style={{ gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--surface)' }}>
                <Icon name="pencil" size={14} />
                {item.note}
              </div>
            )}

            <div className="stack" style={{ gap: 4 }}>
              <div className="live-row live-head">
                <span>Série</span>
                <span>Précédent</span>
                <span>Fait</span>
                <span />
              </div>
              {itemSets.map((set) => {
                const key = `${item.itemId}:${set}`;
                const log = logs?.find((l) => `${l.workoutItemId}:${l.setIndex}` === key);
                const target = targetFor(live.plan, step.item, set);
                const isCurrent = set === step.set;
                const prev = previous?.get(set);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`live-row${isCurrent ? ' current' : ''}${log ? ' done' : ''}`}
                    onClick={() => {
                      const idx = steps.findIndex((s) => s.item === step.item && s.set === set);
                      if (idx !== -1) void updateLive({ cursor: idx, restEndsAt: null });
                    }}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span style={{ fontWeight: 700, color: target.kind === 'warmup' ? 'var(--warn)' : undefined }}>
                      {target.kind === 'warmup' ? 'Écha.' : setNumber(set)}
                    </span>
                    <span className="small muted ellipsis">{prev ? formatSetValues(type, prev) : '—'}</span>
                    <span className="num ellipsis" style={{ fontSize: 18 }}>
                      {log ? formatSetValues(type, log) : isCurrent ? formatSetValues(type, draft) : formatSetValues(type, target)}
                    </span>
                    <span className={`check${log ? ' on' : ''}`} aria-label={log ? 'Série validée' : 'Série à faire'}>
                      {log && <Icon name="check" size={16} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
              <button type="button" className="btn btn-ghost" onClick={() => addExtraSet(live, step.item)}>
                + Ajouter une série
              </button>
            </div>

            {metrics.includes('duration') && <Chrono key={draftKey} targetS={step.target.durationS} onChange={setDuration} />}

            <div className="steppers">
              {metrics.includes('weight') && (
                <Stepper
                  label={metricLabel('weight', type)}
                  unit={metricLabel('weight', type).toLowerCase()}
                  value={draft.weightG}
                  step={2500}
                  format={formatKg}
                  parse={parseKg}
                  onChange={(v) => setField('weightG', v)}
                />
              )}
              {metrics.includes('reps') && (
                <Stepper label="Répétitions" unit="reps" value={draft.reps} step={1} format={count} parse={parseCount} onChange={(v) => setField('reps', v)} inputMode="numeric" />
              )}
              {metrics.includes('distance') && (
                <Stepper label="Distance" unit="km" value={draft.distanceM} step={100} format={formatKm} parse={parseKm} onChange={(v) => setField('distanceM', v)} />
              )}
              {metrics.includes('duration') && (
                <Stepper label="Temps" unit="temps" value={draft.durationS} step={5} format={formatDuration} parse={parseDuration} onChange={(v) => setField('durationS', v)} inputMode="numeric" />
              )}
            </div>

            <button type="button" className="btn btn-primary" style={{ minHeight: 58, fontSize: 17 }} onClick={validate}>
              <Icon name="check" size={20} strokeWidth={3} />
              {loggedForStep ? 'Corriger la série' : `Valider la série ${step.target.kind === 'warmup' ? "d'échauffement" : setNumber(step.set)}`}
            </button>
          </>
        )
      )}

      {resting && (
        <div className="rest-sheet" role="dialog" aria-modal="false" aria-label="Repos">
          <span className="section-title">Repos</span>
          <Ring size={190} progress={live.restTotalS ? 1 - restLeft / live.restTotalS : 0} color="var(--accent)">
            <span className="num" style={{ fontSize: 60, lineHeight: 1 }}>
              {formatDuration(restLeft)}
            </span>
          </Ring>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, width: '100%' }}>
            <button type="button" className="btn" onClick={() => updateLive({ restEndsAt: Math.max(now + 1000, live.restEndsAt! - 15000) })}>
              −15 s
            </button>
            <button type="button" className="btn" onClick={() => updateLive({ restEndsAt: live.restEndsAt! + 15000, restTotalS: live.restTotalS + 15 })}>
              +15 s
            </button>
            <button type="button" className="btn btn-primary" onClick={() => updateLive({ restEndsAt: null })}>
              Passer
            </button>
          </div>
          {nextStep && (
            <span className="small muted">
              Ensuite : {exercises?.get(live.plan[nextStep.item]!.exerciseId)?.name} · {formatSetValues(live.plan[nextStep.item]!.exerciseType, nextStep.target)}
            </span>
          )}
        </div>
      )}

      {finishing && (
        <Sheet title="Terminer la séance ?" onClose={() => setFinishing(false)}>
          <p style={{ margin: 0 }}>
            {logs?.length ?? 0} série{(logs?.length ?? 0) > 1 ? 's' : ''} validée{(logs?.length ?? 0) > 1 ? 's' : ''} sur {steps.length} prévues.
          </p>
          <button type="button" className="btn btn-primary" onClick={finish}>
            Terminer et enregistrer
          </button>
          <button type="button" className="btn" onClick={() => setFinishing(false)}>
            Continuer la séance
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={async () => {
              if (confirm('Abandonner la séance ? Les séries validées seront supprimées.')) {
                await discardSession();
                navigate('/');
              }
            }}
          >
            Abandonner la séance
          </button>
        </Sheet>
      )}
    </div>
  );
}
