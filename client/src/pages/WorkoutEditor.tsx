import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { MuscleId } from '@athlos/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap.tsx';
import { ask } from '../components/Dialog.tsx';
import { ExerciseList } from '../components/ExerciseList.tsx';
import { Icon } from '../components/Icon.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { WorkoutItemCard } from '../components/WorkoutItemCard.tsx';
import { db } from '../db/db.ts';
import {
  addItem,
  deleteWorkout,
  duplicateWorkout,
  liveItems,
  reorderItems,
  supersetLabels,
  toggleSupersetWithNext,
  updateWorkout,
} from '../db/workouts.ts';
import { useStartSession } from '../lib/useStartSession.ts';

export function WorkoutEditor() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const start = useStartSession();
  const workout = useLiveQuery(() => db.workouts.get(id), [id]);
  const items = useLiveQuery(() => liveItems(db, id), [id]);
  const exercises = useLiveQuery(
    async () => {
      const ids = [...new Set(items?.map((i) => i.exerciseId) ?? [])];
      const rows = await db.exercises.bulkGet(ids);
      return new Map(rows.filter((r) => r !== undefined).map((r) => [r.id, r]));
    },
    [items],
  );
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  // Optimistic order while a drag is being persisted, to avoid a flicker back to the old order.
  const [order, setOrder] = useState<string[] | null>(null);

  useEffect(() => setName(workout?.name ?? ''), [workout?.name]);
  useEffect(() => setOrder(null), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ordered = useMemo(() => {
    if (!items) return [];
    if (!order) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    return order.map((oid) => byId.get(oid)).filter((i) => i !== undefined);
  }, [items, order]);

  const labels = supersetLabels(ordered);

  const muscles = useMemo(() => {
    const primary = new Set<MuscleId>();
    const secondary = new Set<MuscleId>();
    for (const i of ordered) {
      const e = exercises?.get(i.exerciseId);
      e?.primaryMuscles.forEach((m) => primary.add(m));
      e?.secondaryMuscles.forEach((m) => secondary.add(m));
    }
    return { primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)) };
  }, [ordered, exercises]);

  if (workout === undefined || items === undefined) return <div className="page muted">Chargement…</div>;
  if (!workout || workout.deleted) {
    return (
      <div className="page">
        <p>Séance introuvable.</p>
        <Link to="/">Retour aux séances</Link>
      </div>
    );
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = ordered.map((i) => i.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrder(next);
    void reorderItems(id, next);
  };

  const sets = ordered.reduce((n, i) => n + i.targets.length, 0);

  return (
    <div className="page">
      <header className="row between">
        <Link to="/" className="icon-btn" aria-label="Retour aux séances">
          <Icon name="back" />
        </Link>
        <div className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => navigate(`/seances/${await duplicateWorkout(id)}`)}
          >
            <Icon name="copy" size={18} />
            Dupliquer
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={async () => {
              const sure = await ask({
                title: `Supprimer la séance « ${workout.name} » ?`,
                message: 'Les séances déjà faites restent dans l’historique.',
                confirm: 'Supprimer',
                danger: true,
              });
              if (sure) {
                await deleteWorkout(id);
                navigate('/');
              }
            }}
          >
            <Icon name="trash" size={18} />
            Supprimer
          </button>
        </div>
      </header>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Nom de la séance</span>
        <input
          className="input"
          style={{ fontSize: 18, fontWeight: 700 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== workout.name && updateWorkout(id, { name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <span className="small muted" style={{ fontWeight: 600 }}>
        {ordered.length} exercice{ordered.length > 1 ? 's' : ''} · {sets} série{sets > 1 ? 's' : ''}
        {labels.size > 0 && ` · ${labels.size} superset${labels.size > 1 ? 's' : ''}`}
      </span>
      {ordered.length > 0 && (
        <button type="button" className="btn btn-primary" onClick={() => start(id)}>
          <Icon name="play" size={18} />
          Démarrer la séance
        </button>
      )}

      <div className="two-col">
        <div className="col-main stack">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ordered.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {ordered.map((item, idx) => {
                const next = ordered[idx + 1];
                const linked = !!item.supersetGroup && item.supersetGroup === next?.supersetGroup;
                return (
                  <Fragment key={item.id}>
                    <WorkoutItemCard
                      item={item}
                      exercise={exercises?.get(item.exerciseId)}
                      supersetLabel={item.supersetGroup ? labels.get(item.supersetGroup) : undefined}
                    />
                    {next && (
                      <button
                        type="button"
                        className={`link-btn${linked ? ' linked' : ''}`}
                        onClick={() => toggleSupersetWithNext(item)}
                        aria-pressed={linked}
                      >
                        {linked ? 'Enchaîné sans repos · délier' : 'Lier en superset avec le suivant'}
                      </button>
                    )}
                  </Fragment>
                );
              })}
            </SortableContext>
          </DndContext>

          <button type="button" className="btn btn-dashed" style={{ minHeight: 56 }} onClick={() => setAdding(true)}>
            <Icon name="plus" size={20} />
            Ajouter un exercice
          </button>
        </div>

        {ordered.length > 0 && (
          <aside className="col-side card stack" style={{ alignItems: 'center' }}>
            <h2 className="label" style={{ alignSelf: 'flex-start' }}>
              Muscles travaillés par la séance
            </h2>
            <BodyMap primary={muscles.primary} secondary={muscles.secondary} height={200} />
          </aside>
        )}
      </div>

      {adding && (
        <Sheet title="Ajouter un exercice" onClose={() => setAdding(false)}>
          <ExerciseList
            onSelect={async (e) => {
              await addItem(id, e);
              setAdding(false);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
