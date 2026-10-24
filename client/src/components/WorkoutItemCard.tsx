import type { ExerciseType, Metric, SetTarget } from '@halko/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LocalExercise, LocalWorkoutItem } from '../db/db.ts';
import { formatDuration, formatKg, formatKm, parseCount, parseDuration, parseKg, parseKm } from '../lib/format.ts';
import { addSet, metricLabel, metricsFor, removeSet, setSimpleCount, updateAll, updateOne } from '../lib/targets.ts';
import { withMode } from '../lib/workoutDraft.ts';
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

// Top of the card: picture, name, number of sets; `children` on the right.
function ItemHeader({ item, exercise, supersetLabel, children }: Props & { children: ReactNode }) {
  return (
    <>
      {supersetLabel && (
        <span className="superset-tag">
          <Icon name="link" size={14} />
          Superset {supersetLabel}
        </span>
      )}
      <div className="row" style={{ gap: 10 }}>
        <img className="thumb thumb-sm" src={thumbUrl(exercise?.mediaUrls ?? [])} alt="" />
        <span className="grow stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="ellipsis" style={{ fontWeight: 700 }}>
            {exercise?.name ?? 'Exercice'}
          </span>
          <span className="small muted">
            {item.targets.length} série{item.targets.length > 1 ? 's' : ''}
          </span>
        </span>
        {children}
      </div>
    </>
  );
}

// A value of the sets: typed in while editing, plain text otherwise (same place, same look).
function Value(props: {
  value: number | undefined;
  format: (v: number | undefined) => string;
  parse: (s: string) => number | null;
  onCommit?: (v: number) => void;
  label: string;
  numeric?: boolean;
  className?: string;
}) {
  const className = props.className ?? 'cell-input';
  if (!props.onCommit) return <span className={`${className} static`}>{props.format(props.value) || '—'}</span>;
  return (
    <ValueInput
      value={props.value}
      format={props.format}
      parse={props.parse}
      onCommit={props.onCommit}
      label={props.label}
      inputMode={props.numeric ? 'numeric' : 'decimal'}
      className={className}
    />
  );
}

// The planned sets, the same read-only and while editing. `onChange` (editing only) receives the changed item.
function ItemSets({ item, type, onChange }: { item: LocalWorkoutItem; type: ExerciseType; onChange?: (item: LocalWorkoutItem) => void }) {
  const metrics = metricsFor(type);
  const first = item.targets[0];
  const edit = onChange && ((targets: SetTarget[]) => onChange({ ...item, targets }));
  const commit = <T,>(fn: (v: T) => SetTarget[]) => edit && ((v: T) => edit(fn(v)));
  const numeric = (m: Metric) => m === 'duration' || m === 'reps';

  if (item.mode === 'simple' && first) {
    return (
      <div className="fields">
        <label className="field">
          <span>Séries</span>
          <Value
            value={item.targets.length}
            format={count}
            parse={(s) => {
              const n = parseCount(s);
              return n && n <= 30 ? n : null;
            }}
            onCommit={commit((n: number) => setSimpleCount(item.targets, n))}
            label="Nombre de séries"
            numeric
          />
        </label>
        {metrics.map((m) => (
          <label key={m} className="field">
            <span>{metricLabel(m, type)}</span>
            <Value
              value={first[METRIC_IO[m].key] as number | undefined}
              format={METRIC_IO[m].format}
              parse={METRIC_IO[m].parse}
              onCommit={commit((v: number) => updateAll(item.targets, { [METRIC_IO[m].key]: v }))}
              label={metricLabel(m, type)}
              numeric={numeric(m)}
            />
          </label>
        ))}
        <label className="field">
          <span>Repos</span>
          <Value
            value={first.restS}
            format={formatDuration}
            parse={parseDuration}
            onCommit={commit((v: number) => updateAll(item.targets, { restS: v }))}
            label="Repos entre les séries"
            numeric
          />
        </label>
      </div>
    );
  }

  return (
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
        const kind = t.kind === 'warmup' ? 'Écha.' : workingIndex;
        return (
          <div key={idx} className="set-row">
            {edit ? (
              <button
                type="button"
                className={`kind-btn${t.kind === 'warmup' ? ' warmup' : ''}`}
                onClick={() => edit(updateOne(item.targets, idx, { kind: t.kind === 'warmup' ? 'normal' : 'warmup' }))}
                aria-label={`Série ${idx + 1} : ${t.kind === 'warmup' ? 'échauffement' : 'série de travail'}, cliquer pour changer`}
              >
                {kind}
              </button>
            ) : (
              <span className={`kind-btn${t.kind === 'warmup' ? ' warmup' : ''}`}>{kind}</span>
            )}
            {metrics.map((m) => (
              <Value
                key={m}
                value={t[METRIC_IO[m].key] as number | undefined}
                format={METRIC_IO[m].format}
                parse={METRIC_IO[m].parse}
                onCommit={commit((v: number) => updateOne(item.targets, idx, { [METRIC_IO[m].key]: v }))}
                label={`Série ${idx + 1}, ${metricLabel(m, type)}`}
                numeric={numeric(m)}
              />
            ))}
            <Value
              className="cell-input rest"
              value={t.restS}
              format={formatDuration}
              parse={parseDuration}
              onCommit={commit((v: number) => updateOne(item.targets, idx, { restS: v }))}
              label={`Série ${idx + 1}, repos`}
              numeric
            />
            {edit ? (
              <button
                type="button"
                className="icon-btn"
                style={{ background: 'transparent', width: 36, height: 36 }}
                onClick={() => edit(removeSet(item.targets, idx))}
                disabled={item.targets.length <= 1}
                aria-label={`Supprimer la série ${idx + 1}`}
              >
                <Icon name="close" size={16} />
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      {edit && (
        <button type="button" className="btn btn-ghost" onClick={() => edit(addSet(item.targets, type))}>
          + Ajouter une série
        </button>
      )}
    </div>
  );
}

// An exercise of a workout being edited: changes go to `onChange`, saved with the whole workout.
export function WorkoutItemCard({
  item,
  exercise,
  supersetLabel,
  onChange,
  onRemove,
}: Props & { onChange: (item: LocalWorkoutItem) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [note, setNote] = useState(item.note ?? '');
  useEffect(() => setNote(item.note ?? ''), [item.note]);
  const type = exercise?.exerciseType ?? 'weight_reps';

  return (
    <article
      ref={setNodeRef}
      className={`item-card${supersetLabel ? ' in-superset' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined, position: 'relative' }}
    >
      <ItemHeader item={item} exercise={exercise} supersetLabel={supersetLabel}>
        <button type="button" className="icon-btn" style={{ background: 'transparent', width: 36 }} onClick={onRemove} aria-label={`Retirer ${exercise?.name ?? "l'exercice"}`}>
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
      </ItemHeader>

      <div className="seg" role="group" aria-label="Mode de saisie">
        <button type="button" aria-pressed={item.mode === 'simple'} onClick={() => onChange(withMode(item, 'simple'))}>
          Simple
        </button>
        <button type="button" aria-pressed={item.mode === 'per_set'} onClick={() => onChange(withMode(item, 'per_set'))}>
          Série par série
        </button>
      </div>

      <ItemSets item={item} type={type} onChange={onChange} />

      <label className="note-input">
        <Icon name="pencil" size={16} />
        <span className="sr-only">Note pour {exercise?.name}</span>
        <input
          value={note}
          placeholder="Ajouter une note (réglage machine, consigne…)"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (item.note ?? '') && onChange({ ...item, note: note.trim() || null })}
        />
      </label>
    </article>
  );
}

// The same card read-only: the planned sets as they are shown while editing, without the controls.
export function WorkoutItemView({ item, exercise, supersetLabel }: Props) {
  return (
    <article className={`item-card${supersetLabel ? ' in-superset' : ''}`}>
      <Link to={`/exercices/${item.exerciseId}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
        <ItemHeader item={item} exercise={exercise} supersetLabel={supersetLabel}>
          <Icon name="chevron" size={18} />
        </ItemHeader>
      </Link>
      <ItemSets item={item} type={exercise?.exerciseType ?? 'weight_reps'} />
      {item.note && (
        <p className="note-input" style={{ margin: 0, fontSize: 13 }}>
          <Icon name="pencil" size={16} />
          {item.note}
        </p>
      )}
    </article>
  );
}
