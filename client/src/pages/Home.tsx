import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { SyncBadge } from '../components/SyncBadge.tsx';
import { db } from '../db/db.ts';
import { createWorkout, reorderWorkouts } from '../db/workouts.ts';
import { useStartSession } from '../lib/useStartSession.ts';

function useWorkoutSummaries() {
  return useLiveQuery(async () => {
    const workouts = await db.workouts.orderBy('position').filter((w) => !w.deleted).toArray();
    const items = await db.workoutItems.filter((i) => !i.deleted).toArray();
    return workouts.map((w) => {
      const mine = items.filter((i) => i.workoutId === w.id);
      return {
        ...w,
        exercises: mine.length,
        sets: mine.reduce((n, i) => n + i.targets.length, 0),
      };
    });
  }, []);
}

type Summary = NonNullable<ReturnType<typeof useWorkoutSummaries>>[number];

// A workout of the list. Dragging the card moves it; a plain click opens it. From the keyboard the card
// is the stop: Space picks it up (arrows, then Space to drop), Enter opens it.
function WorkoutCard({ workout, onStart }: { workout: Summary; onStart: () => void }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: workout.id });
  return (
    <div
      ref={setNodeRef}
      className="list-item"
      style={{
        padding: '10px 10px 10px 14px',
        cursor: isDragging ? 'grabbing' : 'default',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 2 : undefined,
        position: 'relative',
        userSelect: 'none',
      }}
      {...attributes}
      {...listeners}
      // Keys on the Start button are the button's; while the card is being moved, dnd-kit handles them
      // (arrows, Space or Enter to drop).
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || isDragging) return;
        if (e.key === 'Enter') navigate(`/seances/${workout.id}`);
        else listeners?.onKeyDown?.(e);
      }}
      aria-roledescription="séance déplaçable"
      aria-label={workout.name}
    >
      {/* For the mouse only (the card is the keyboard stop), and no native link drag. */}
      <Link
        to={`/seances/${workout.id}`}
        tabIndex={-1}
        draggable={false}
        className="row grow"
        style={{ textDecoration: 'none', color: 'var(--text)' }}
      >
        <span
          className="num"
          style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, background: 'var(--surface2)', display: 'grid', placeItems: 'center', color: 'var(--accent-text)', fontSize: 18 }}
          aria-hidden="true"
        >
          {workout.name.charAt(0).toUpperCase()}
        </span>
        <span className="grow stack" style={{ gap: 2 }}>
          <span className="ellipsis" style={{ fontWeight: 700 }}>
            {workout.name}
          </span>
          <span className="small muted">
            {workout.exercises} exercice{workout.exercises > 1 ? 's' : ''} · {workout.sets} série{workout.sets > 1 ? 's' : ''}
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="btn btn-primary"
        style={{ minHeight: 44, padding: '0 14px' }}
        onClick={onStart}
        disabled={workout.exercises === 0}
        aria-label={`Démarrer ${workout.name}`}
      >
        <Icon name="play" size={18} />
        Démarrer
      </button>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const start = useStartSession();
  const workouts = useWorkoutSummaries();
  // Optimistic order while a move is being saved, to avoid a flicker back to the old order.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [workouts]);
  const ordered = useMemo(() => {
    if (!workouts) return [];
    if (!order) return workouts;
    const byId = new Map(workouts.map((w) => [w.id, w]));
    return order.map((id) => byId.get(id)).filter((w) => w !== undefined);
  }, [workouts, order]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Dropping a card on its link must not open it (dnd-kit stops the click, not the link's navigation).
  const moved = useRef(false);
  useEffect(() => {
    const block = (e: MouseEvent) => moved.current && e.preventDefault();
    addEventListener('click', block, true);
    return () => removeEventListener('click', block, true);
  }, []);
  const settle = () => setTimeout(() => (moved.current = false));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    settle();
    if (!over || active.id === over.id) return;
    const ids = ordered.map((w) => w.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrder(next);
    void reorderWorkouts(next);
  };
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const create = async () => navigate(`/seances/${await createWorkout('Nouvelle séance')}/modifier`);

  return (
    <div className="page">
      <header className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted" style={{ fontWeight: 600, textTransform: 'capitalize' }}>
            {today}
          </span>
          <h1 className="title">Mes séances</h1>
        </div>
        <SyncBadge />
      </header>

      {workouts?.length === 0 && (
        <div className="card stack" style={{ alignItems: 'flex-start' }}>
          <h2 className="title-sm">Crée ta première séance</h2>
          <p className="muted" style={{ margin: 0 }}>
            Ajoute des exercices, choisis séries, répétitions ou temps, et enregistre.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => (moved.current = true)}
          onDragEnd={onDragEnd}
          onDragCancel={settle}
        >
          <SortableContext items={ordered.map((w) => w.id)} strategy={rectSortingStrategy}>
            {ordered.map((w) => (
              <WorkoutCard key={w.id} workout={w} onStart={() => start(w.id)} />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <button type="button" className="btn btn-dashed" onClick={create}>
        <Icon name="plus" size={20} />
        Nouvelle séance
      </button>
    </div>
  );
}
