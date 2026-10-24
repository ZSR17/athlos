import { EQUIPMENT_LABELS, EXERCISE_TYPES, MUSCLE_GROUPS, MUSCLES, type MuscleId } from '@halko/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { type LocalExercise, db } from '../db/db.ts';
import { syncStatus } from '../sync/engine.ts';
import { ExerciseMedia, thumbUrl } from './ExerciseMedia.tsx';
import { Icon } from './Icon.tsx';
import { Progress } from './Progress.tsx';

const PAGE = 40;

function muscleLine(e: LocalExercise): string {
  const p = e.primaryMuscles.map((m) => MUSCLES[m]).join(', ');
  const s = e.secondaryMuscles.map((m) => MUSCLES[m].toLowerCase()).join(', ');
  return s ? `${p} · ${s}` : p;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const PREVIEW_W = 300;
const PREVIEW_H = 270;

// Hovering a row with the mouse while picking shows the movement next to it (after a short pause, so
// sweeping the list does not flash previews). Hidden when the list scrolls.
function usePreview() {
  const [preview, setPreview] = useState<{ exercise: LocalExercise; top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hide = () => {
    clearTimeout(timer.current);
    setPreview(null);
  };
  useEffect(() => {
    if (!preview) return;
    addEventListener('scroll', hide, true);
    return () => removeEventListener('scroll', hide, true);
  }, [preview]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (exercise: LocalExercise, e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const left = r.right + 12 + PREVIEW_W <= innerWidth ? r.right + 12 : r.left - 12 - PREVIEW_W;
    if (left < 0) return;
    const top = Math.min(Math.max(8, r.top + r.height / 2 - PREVIEW_H / 2), innerHeight - PREVIEW_H - 8);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview({ exercise, top, left }), 250);
  };

  const card =
    preview &&
    createPortal(
      <div className="exercise-preview" style={{ top: preview.top, left: preview.left, width: PREVIEW_W }} aria-hidden="true">
        <ExerciseMedia urls={preview.exercise.mediaUrls} name={preview.exercise.name} style={{ height: PREVIEW_H - 46 }} />
        <span className="ellipsis" style={{ fontWeight: 700, padding: '0 12px' }}>
          {preview.exercise.name}
        </span>
      </div>,
      document.body,
    );
  return { show, hide, card };
}

function useExercises(): LocalExercise[] | undefined {
  // French alphabetical order: the index sorts "Écarté" after "Z".
  return useLiveQuery(async () => {
    const all = await db.exercises.filter((e) => !e.deleted).toArray();
    return all.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }, []);
}

// Library list with search and muscle-group filters. Links to the exercise page, or calls
// `onSelect` when used as a picker.
export function ExerciseList({ onSelect }: { onSelect?: (e: LocalExercise) => void }) {
  const all = useExercises();
  const { download } = syncStatus.use();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const preview = usePreview();

  const filtered = useMemo(() => {
    if (!all) return [];
    const q = normalize(query.trim());
    const muscles = MUSCLE_GROUPS.find((g) => g.id === group)?.muscles as readonly MuscleId[] | undefined;
    return all.filter(
      (e) =>
        (!q || normalize(e.name).includes(q)) &&
        (!muscles || e.primaryMuscles.some((m) => muscles.includes(m))),
    );
  }, [all, query, group]);

  useEffect(() => setShown(PAGE), [query, group]);

  // Render progressively as the user scrolls: 900 rows with images at once is heavy.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  return (
    <div className="stack">
      <label className="search">
        <Icon name="search" size={20} />
        <span className="sr-only">Rechercher un exercice</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={all ? `Rechercher parmi ${all.length} exercices` : 'Rechercher'}
        />
      </label>
      <div className="chips" role="group" aria-label="Filtrer par muscle">
        <button type="button" className="chip" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
          Tous
        </button>
        {MUSCLE_GROUPS.map((g) => (
          <button key={g.id} type="button" className="chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <span className="label">
        {all === undefined ? 'Chargement…' : `${filtered.length} exercice${filtered.length > 1 ? 's' : ''}`}
      </span>
      {download && <Progress label="Téléchargement de la bibliothèque" done={download.done} total={download.total} />}
      {all?.length === 0 && !download && (
        <p className="muted">La bibliothèque se télécharge depuis le serveur à la première connexion.</p>
      )}
      <div className="stack" style={{ gap: 8 }}>
        {filtered.slice(0, shown).map((e) => {
          const content = (
            <>
              <img className="thumb" src={thumbUrl(e.mediaUrls)} alt="" loading="lazy" />
              <div className="grow stack" style={{ gap: 3 }}>
                <span className="ellipsis" style={{ fontWeight: 700 }}>
                  {e.name}
                </span>
                <span className="small muted ellipsis">{muscleLine(e)}</span>
                <span className="small muted ellipsis">
                  {e.equipment.map((q) => EQUIPMENT_LABELS[q] ?? q).join(', ') || 'Poids du corps'}
                </span>
              </div>
              <span className="tag" style={{ color: 'var(--muted)' }}>
                {EXERCISE_TYPES[e.exerciseType].label}
              </span>
            </>
          );
          return onSelect ? (
            <button
              key={e.id}
              type="button"
              className="list-item"
              onClick={() => (preview.hide(), onSelect(e))}
              onPointerEnter={(ev) => preview.show(e, ev)}
              onPointerLeave={preview.hide}
            >
              {content}
            </button>
          ) : (
            <Link key={e.id} to={`/exercices/${e.id}`} className="list-item">
              {content}
            </Link>
          );
        })}
        {shown < filtered.length && <div ref={sentinel} style={{ height: 1 }} />}
      </div>
      {preview.card}
    </div>
  );
}
