import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { MuscleId } from '@halko/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BackLink, useLeave } from '../components/BackLink.tsx';
import { BodyMap } from '../components/BodyMap.tsx';
import { ask } from '../components/Dialog.tsx';
import { ExerciseList } from '../components/ExerciseList.tsx';
import { Icon } from '../components/Icon.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { WorkoutItemCard, WorkoutItemView } from '../components/WorkoutItemCard.tsx';
import { WorkoutProgress } from '../components/WorkoutProgress.tsx';
import { type LocalWorkoutItem, db } from '../db/db.ts';
import { deleteWorkout, duplicateWorkout, liveItems, newItem, saveWorkout, supersetLabels } from '../db/workouts.ts';
import { useStartSession } from '../lib/useStartSession.ts';
import { moveItem, removeItemAt, toggleSuperset } from '../lib/workoutDraft.ts';

// How the edit page was opened: from the workout's page (leaving goes back to it), right after the
// workout was created (cancelling deletes it), or to add an exercise to it.
export interface EditState {
  fromView?: boolean;
  created?: boolean;
  add?: string;
}

interface Draft {
  name: string;
  items: LocalWorkoutItem[];
}

// A workout, read-only; with `editing` (its /modifier page), a draft of it saved by « Enregistrer ».
export function WorkoutEditor({ editing = false }: { editing?: boolean }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const leave = useLeave();
  const state = (useLocation().state ?? {}) as EditState;
  const start = useStartSession();
  // null once looked up and not found (undefined while loading).
  const workout = useLiveQuery(async () => (await db.workouts.get(id)) ?? null, [id]);
  const items = useLiveQuery(() => liveItems(db, id), [id]);
  // The draft, and what it started from (to know whether anything changed).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing || base || !workout || !items) return;
    let cancelled = false;
    void (async () => {
      const added = state.add ? await db.exercises.get(state.add) : undefined;
      const first = { name: workout.name, items };
      const withAdded = added ? { ...first, items: [...items, await newItem(id, added)] } : first;
      if (cancelled) return;
      setBase(first);
      setDraft(withAdded);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, base, workout, items, id, state.add]);

  const shown = (editing ? draft?.items : items) ?? [];
  const exerciseIds = [...new Set(shown.map((i) => i.exerciseId))].join(',');
  const exercises = useLiveQuery(
    async () => {
      const rows = await db.exercises.bulkGet(exerciseIds ? exerciseIds.split(',') : []);
      return new Map(rows.filter((r) => r !== undefined).map((r) => [r.id, r]));
    },
    [exerciseIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const labels = supersetLabels(shown);

  const muscles = useMemo(() => {
    const primary = new Set<MuscleId>();
    const secondary = new Set<MuscleId>();
    for (const i of shown) {
      const e = exercises?.get(i.exerciseId);
      e?.primaryMuscles.forEach((m) => primary.add(m));
      e?.secondaryMuscles.forEach((m) => secondary.add(m));
    }
    return { primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)) };
  }, [shown, exercises]);

  if (workout === undefined || items === undefined || (editing && workout && !workout.deleted && !draft)) {
    return <div className="page muted">Chargement…</div>;
  }
  if (!workout || workout.deleted) {
    return (
      <div className="page">
        <p>Séance introuvable.</p>
        <Link to="/">Retour aux séances</Link>
      </div>
    );
  }

  const sets = shown.reduce((n, i) => n + i.targets.length, 0);
  const summary = (
    <span className="small muted" style={{ fontWeight: 600 }}>
      {shown.length} exercice{shown.length > 1 ? 's' : ''} · {sets} série{sets > 1 ? 's' : ''}
      {labels.size > 0 && ` · ${labels.size} superset${labels.size > 1 ? 's' : ''}`}
    </span>
  );
  const musclesCard = shown.length > 0 && (
    <aside className="col-side card stack" style={{ alignItems: 'center' }}>
      <h2 className="label" style={{ alignSelf: 'flex-start' }}>
        Muscles travaillés par la séance
      </h2>
      <BodyMap primary={muscles.primary} secondary={muscles.secondary} height={200} />
    </aside>
  );

  if (!editing) {
    const edit: EditState = { fromView: true };
    return (
      <div className="page">
        <header className="row between">
          <BackLink to="/" />
          <div className="row" style={{ gap: 4 }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Dupliquer la séance"
              onClick={async () => {
                const created: EditState = { created: true };
                navigate(`/seances/${await duplicateWorkout(id)}/modifier`, { state: created });
              }}
            >
              <Icon name="copy" size={18} />
            </button>
            <button
              type="button"
              className="icon-btn btn-danger"
              aria-label="Supprimer la séance"
              onClick={async () => {
                const sure = await ask({
                  title: `Supprimer la séance « ${workout.name} » ?`,
                  message: 'Les séances déjà faites restent dans l’historique.',
                  confirm: 'Supprimer',
                  danger: true,
                });
                if (!sure) return;
                await deleteWorkout(id);
                leave('/');
              }}
            >
              <Icon name="trash" size={18} />
            </button>
            <Link to={`/seances/${id}/modifier`} state={edit} className="btn btn-ghost">
              <Icon name="pencil" size={18} />
              Modifier
            </Link>
          </div>
        </header>
        <h1 className="title">{workout.name}</h1>
        {summary}
        {shown.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => start(id)}>
            <Icon name="play" size={18} />
            Démarrer la séance
          </button>
        )}
        <div className="two-col">
          <div className="col-main stack">
            {shown.length === 0 && (
              <div className="card stack" style={{ alignItems: 'flex-start' }}>
                <p className="muted" style={{ margin: 0 }}>
                  Aucun exercice pour l’instant.
                </p>
                <Link to={`/seances/${id}/modifier`} state={edit} className="btn">
                  <Icon name="plus" size={18} />
                  Ajouter des exercices
                </Link>
              </div>
            )}
            {shown.map((item) => (
              <WorkoutItemView
                key={item.id}
                item={item}
                exercise={exercises?.get(item.exerciseId)}
                supersetLabel={item.supersetGroup ? labels.get(item.supersetGroup) : undefined}
              />
            ))}
          </div>
          {musclesCard}
        </div>
        <WorkoutProgress workoutId={id} name={workout.name} />
      </div>
    );
  }

  const current = draft!;
  const setItems = (next: LocalWorkoutItem[]) => setDraft({ ...current, items: next });
  const changed = JSON.stringify(current) !== JSON.stringify(base);

  const cancel = async () => {
    if (changed && !(await ask({
        title: 'Abandonner les modifications ?',
        message: 'Tes changements sur cette séance ne seront pas enregistrés.',
        confirm: 'Abandonner',
        cancel: 'Continuer',
        danger: true,
      }))) {
      return;
    }
    if (state.created) await deleteWorkout(id);
    // Back where the edit page was opened from: the workout's page, the list, an exercise…
    if (state.fromView) navigate(-1);
    else leave(state.created ? '/' : `/seances/${id}`);
  };
  const save = async () => {
    setSaving(true);
    await saveWorkout(id, current.name, current.items);
    if (state.fromView) navigate(-1);
    else navigate(`/seances/${id}`, { replace: true });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = current.items.map((i) => i.id);
    setItems(moveItem(current.items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <div className="page">
      <header className="row between">
        <button type="button" className="icon-btn" aria-label="Annuler" onClick={() => void cancel()}>
          <Icon name="close" />
        </button>
        <button type="button" className="btn btn-primary" disabled={saving || !current.name.trim()} onClick={() => void save()}>
          <Icon name="check" size={18} />
          Enregistrer
        </button>
      </header>
      <input
        className="input title-input"
        aria-label="Nom de la séance"
        placeholder="Nom de la séance"
        value={current.name}
        onChange={(e) => setDraft({ ...current, name: e.target.value })}
      />
      {summary}
      <div className="two-col">
        <div className="col-main stack">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={current.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {current.items.map((item, idx) => {
                const next = current.items[idx + 1];
                const linked = !!item.supersetGroup && item.supersetGroup === next?.supersetGroup;
                return (
                  <Fragment key={item.id}>
                    <WorkoutItemCard
                      item={item}
                      exercise={exercises?.get(item.exerciseId)}
                      supersetLabel={item.supersetGroup ? labels.get(item.supersetGroup) : undefined}
                      onChange={(edited) => setItems(current.items.map((i, k) => (k === idx ? edited : i)))}
                      onRemove={() => setItems(removeItemAt(current.items, idx))}
                    />
                    {next && (
                      <button
                        type="button"
                        className={`link-btn${linked ? ' linked' : ''}`}
                        onClick={() => setItems(toggleSuperset(current.items, idx))}
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
        {musclesCard}
      </div>

      {adding && (
        <Sheet title="Ajouter un exercice" onClose={() => setAdding(false)}>
          <ExerciseList
            onSelect={async (e) => {
              const added = await newItem(id, e);
              setDraft((d) => d && { ...d, items: [...d.items, added] });
              setAdding(false);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
