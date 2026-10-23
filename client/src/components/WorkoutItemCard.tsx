import type { Metric, SetTarget } from '@athlos/shared';
import { EXERCISE_TYPES } from '@athlos/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LocalExercise, LocalWorkoutItem } from '../db/db.ts';
import { removeItem, setItemMode, updateItem } from '../db/workouts.ts';
import { formatDuration, formatKg, formatKm, parseCount, parseDuration, parseKg, parseKm } from '../lib/format.ts';
import { addSet, metricLabel, metricsFor, removeSet, setSimpleCount, updateAll, updateOne } from '../lib/targets.ts';
import { thumbUrl } from './ExerciseMedia.tsx';
import { Icon } from './Icon.tsx';
import { ValueInput } from './ValueInput.tsx';

const count = (v: number | undefined) => (v === undefined ? '' : String(v));

// How each metric maps onto a SetTarget field, and how it is shown / typed.
const METRIC_IO: Record<Metric, { key: keyof SetTarget; format: (v: number | undefined) => string; parse: (s: string) => number | null }> = {
  reps: { key: 'reps', format: count, parse: parseCount },
  weight: { key: 'weightG', format: formatKg, parse: parseKg },
  duration: { key: 'durationS', format: formatDuration, parse: parseDuration },
  distance: { key: 'distanceM', format: formatKm, parse: parseKm },
};

interface Props {
  item: LocalWorkoutItem;
  exercise: LocalExercise | undefined;
  supersetLabel?: string;
}

export function WorkoutItemCard({ item, exercise, supersetLabel }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [note, setNote] = useState(item.note ?? '');
  useEffect(() => setNote(item.note ?? ''), [item.note]);

  const type = exercise?.exerciseType ?? 'weight_reps';
  const metrics = metricsFor(type);
  const setTargets = (targets: SetTarget[]) => updateItem(item.id, { targets });
  const first = item.targets[0];

  return (
    <article
      ref={setNodeRef}
      className={`item-card${supersetLabel ? ' in-superset' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined, position: 'relative' }}
    >
      {supersetLabel && (
        <span className="superset-tag">
          <Icon name="link" size={14} />
          Superset {supersetLabel}
        </span>
      )}
      <div className="row" style={{ gap: 10 }}>
        <img className="thumb thumb-sm" src={thumbUrl(exercise?.mediaUrls ?? [])} alt="" />
        <div className="grow stack" style={{ gap: 2 }}>
          <Link to={`/exercices/${item.exerciseId}`} className="ellipsis" style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
            {exercise?.name ?? 'Exercice'}
          </Link>
          <span className="small muted">{EXERCISE_TYPES[type].label}</span>
        </div>
        <button type="button" className="icon-btn" style={{ background: 'transparent', width: 36 }} onClick={() => removeItem(item)} aria-label={`Retirer ${exercise?.name ?? "l'exercice"}`}>
          <Icon name="trash" size={18} />
        </button>
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="icon-btn drag-handle"
          aria-label={`Déplacer ${exercise?.name ?? "l'exercice"}`}
          {...attributes}
          {...listeners}
        >
          <Icon name="grip" size={18} />
        </button>
      </div>

      <div className="seg" role="group" aria-label="Mode de saisie">
        <button type="button" aria-pressed={item.mode === 'simple'} onClick={() => setItemMode(item, 'simple')}>
          Simple
        </button>
        <button type="button" aria-pressed={item.mode === 'per_set'} onClick={() => setItemMode(item, 'per_set')}>
          Série par série
        </button>
      </div>

      {item.mode === 'simple' && first && (
        <div className="fields">
          <label className="field">
            <span>Séries</span>
            <ValueInput
              value={item.targets.length}
              format={count}
              parse={(s) => {
                const n = parseCount(s);
                return n && n <= 30 ? n : null;
              }}
              onCommit={(n) => setTargets(setSimpleCount(item.targets, n))}
              label="Nombre de séries"
              inputMode="numeric"
            />
          </label>
          {metrics.map((m) => (
            <label key={m} className="field">
              <span>{metricLabel(m, type)}</span>
              <ValueInput
                value={first[METRIC_IO[m].key] as number | undefined}
                format={METRIC_IO[m].format}
                parse={METRIC_IO[m].parse}
                onCommit={(v) => setTargets(updateAll(item.targets, { [METRIC_IO[m].key]: v }))}
                label={metricLabel(m, type)}
                inputMode={m === 'duration' || m === 'reps' ? 'numeric' : 'decimal'}
              />
            </label>
          ))}
          <label className="field">
            <span>Repos</span>
            <ValueInput
              value={first.restS}
              format={formatDuration}
              parse={parseDuration}
              onCommit={(v) => setTargets(updateAll(item.targets, { restS: v }))}
              label="Repos entre les séries"
              inputMode="numeric"
            />
          </label>
        </div>
      )}

      {item.mode === 'per_set' && (
        <div className="stack" style={{ gap: 4, ['--cols' as string]: metrics.length }}>
          <div className="set-row set-head">
            <span>Série</span>
            {metrics.map((m) => (
              <span key={m}>{metricLabel(m, type)}</span>
            ))}
            <span>Repos</span>
            <span />
          </div>
          {item.targets.map((t, idx) => {
            const workingIndex = item.targets.slice(0, idx + 1).filter((x) => x.kind !== 'warmup').length;
            return (
              <div key={idx} className="set-row">
                <button
                  type="button"
                  className={`kind-btn${t.kind === 'warmup' ? ' warmup' : ''}`}
                  onClick={() => setTargets(updateOne(item.targets, idx, { kind: t.kind === 'warmup' ? 'normal' : 'warmup' }))}
                  aria-label={`Série ${idx + 1} : ${t.kind === 'warmup' ? 'échauffement' : 'série de travail'}, cliquer pour changer`}
                >
                  {t.kind === 'warmup' ? 'Écha.' : workingIndex}
                </button>
                {metrics.map((m) => (
                  <ValueInput
                    key={m}
                    value={t[METRIC_IO[m].key] as number | undefined}
                    format={METRIC_IO[m].format}
                    parse={METRIC_IO[m].parse}
                    onCommit={(v) => setTargets(updateOne(item.targets, idx, { [METRIC_IO[m].key]: v }))}
                    label={`Série ${idx + 1}, ${metricLabel(m, type)}`}
                    inputMode={m === 'duration' || m === 'reps' ? 'numeric' : 'decimal'}
                  />
                ))}
                <ValueInput
                  className="cell-input rest"
                  value={t.restS}
                  format={formatDuration}
                  parse={parseDuration}
                  onCommit={(v) => setTargets(updateOne(item.targets, idx, { restS: v }))}
                  label={`Série ${idx + 1}, repos`}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{ background: 'transparent', width: 36, height: 36 }}
                  onClick={() => setTargets(removeSet(item.targets, idx))}
                  disabled={item.targets.length <= 1}
                  aria-label={`Supprimer la série ${idx + 1}`}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost" onClick={() => setTargets(addSet(item.targets, type))}>
            + Ajouter une série
          </button>
        </div>
      )}

      <label className="note-input">
        <Icon name="pencil" size={16} />
        <span className="sr-only">Note pour {exercise?.name}</span>
        <input
          value={note}
          placeholder="Ajouter une note (réglage machine, consigne…)"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (item.note ?? '') && updateItem(item.id, { note: note.trim() || null })}
        />
      </label>
    </article>
  );
}
