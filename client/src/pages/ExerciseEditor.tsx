import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Crop, EQUIPMENT_LABELS, EXERCISE_TYPE_IDS, EXERCISE_TYPES, type ExerciseType, MUSCLE_IDS, MUSCLES, type MuscleId } from '@athlos/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap.tsx';
import { ask } from '../components/Dialog.tsx';
import { CropSheet } from '../components/CropSheet.tsx';
import { thumbUrl } from '../components/ExerciseMedia.tsx';
import { Icon } from '../components/Icon.tsx';
import { db } from '../db/db.ts';
import {
  type ExerciseFields,
  UploadError,
  createExercise,
  deleteExercise,
  importMediaFromUrl,
  resetExercise,
  updateExercise,
  uploadMedia,
} from '../db/exercises.ts';

const EMPTY: ExerciseFields = {
  name: '',
  exerciseType: 'weight_reps',
  equipment: [],
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  mediaIds: [],
  mediaUrls: [],
};

type Level = 'primary' | 'secondary' | null;

// A video comes with its poster image: they are shown, and removed, together.
function mediaGroups(f: Pick<ExerciseFields, 'mediaIds' | 'mediaUrls'>) {
  const groups: { ids: string[]; urls: string[] }[] = [];
  for (let i = 0; i < f.mediaUrls.length; i++) {
    const n = f.mediaUrls[i]!.endsWith('.mp4') && i + 1 < f.mediaUrls.length ? 2 : 1;
    groups.push({ ids: f.mediaIds.slice(i, i + n), urls: f.mediaUrls.slice(i, i + n) });
    i += n - 1;
  }
  return groups;
}

type MediaGroup = ReturnType<typeof mediaGroups>[number];

// A photo or video of the exercise. With two photos, dragging one (or Space on it, then arrows) swaps
// them: the first is the start of the movement, the second its end.
function MediaTile({ group, label, onRemove }: { group: MediaGroup; label: string | null; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.ids[0]! });
  const video = group.urls[0]!.endsWith('.mp4');
  return (
    <div
      ref={setNodeRef}
      className="media-tile"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 2 : undefined,
        cursor: label ? (isDragging ? 'grabbing' : 'grab') : undefined,
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
      aria-roledescription="photo déplaçable"
      aria-label={video ? 'Vidéo' : `Photo${label ? ` : ${label.toLowerCase()} du mouvement` : ''}`}
    >
      <img src={thumbUrl(group.urls)} alt="" draggable={false} />
      {(video || label) && <span className="badge">{video ? 'Vidéo' : label}</span>}
      <button
        type="button"
        className="remove"
        aria-label="Retirer"
        onClick={onRemove}
        // The button's own presses, not a move of the tile.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

// Creates a custom exercise (/exercices/nouveau) or edits one (/exercices/:id/modifier).
// Editing a built-in exercise keeps a personal version that can be reverted.
export function ExerciseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const existing = useLiveQuery(() => (id ? db.exercises.get(id) : undefined), [id]);
  const [f, setF] = useState<ExerciseFields | null>(id ? null : EMPTY);
  const [steps, setSteps] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  // Photo waiting for its framing before being sent: `send` sends it with the part chosen, `release`
  // frees its preview whatever happens, `added` runs once it is in the exercise.
  const [cropping, setCropping] = useState<{
    src: string;
    message: string;
    send: (crop: Crop | null) => Promise<{ ids: string[]; urls: string[] }>;
    release?: () => void;
    added?: () => void;
  } | null>(null);
  // Last photo or video removed, until it is put back or another one is added.
  const [removed, setRemoved] = useState<{ ids: string[]; urls: string[]; at: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load once: later sync updates must not overwrite what is being typed.
  useEffect(() => {
    if (existing && !f) {
      setF({
        name: existing.name,
        exerciseType: existing.exerciseType,
        equipment: existing.equipment,
        primaryMuscles: existing.primaryMuscles,
        secondaryMuscles: existing.secondaryMuscles,
        instructions: existing.instructions,
        mediaIds: existing.mediaIds,
        mediaUrls: existing.mediaUrls,
      });
      setSteps(existing.instructions.join('\n'));
    }
  }, [existing, f]);

  if (id && existing === null) return <div className="page">Exercice introuvable.</div>;
  if (!f) return <div className="page muted">Chargement…</div>;

  const set = (patch: Partial<ExerciseFields>) => setF({ ...f, ...patch });
  const level = (m: MuscleId): Level =>
    f.primaryMuscles.includes(m) ? 'primary' : f.secondaryMuscles.includes(m) ? 'secondary' : null;
  // Click: none -> main -> secondary -> none.
  const cycle = (m: MuscleId) => {
    const l = level(m);
    set({
      primaryMuscles: l === null ? [...f.primaryMuscles, m] : f.primaryMuscles.filter((x) => x !== m),
      secondaryMuscles: l === 'primary' ? [...f.secondaryMuscles, m] : f.secondaryMuscles.filter((x) => x !== m),
    });
  };
  const toggleEquipment = (q: string) =>
    set({ equipment: f.equipment.includes(q) ? f.equipment.filter((x) => x !== q) : [...f.equipment, q] });

  const groups = mediaGroups(f);
  const hasVideo = f.mediaUrls.some((u) => u.endsWith('.mp4'));
  const photos = groups.length;
  const onMediaMoved = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = groups.map((g) => g.ids[0]);
    const moved = arrayMove(groups, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setRemoved(null);
    set({ mediaIds: moved.flatMap((g) => g.ids), mediaUrls: moved.flatMap((g) => g.urls) });
  };
  const removeGroup = (g: { ids: string[]; urls: string[] }) => {
    setRemoved({ ...g, at: f.mediaIds.indexOf(g.ids[0]!) });
    set({
      mediaIds: f.mediaIds.filter((x) => !g.ids.includes(x)),
      mediaUrls: f.mediaUrls.filter((_, i) => !g.ids.includes(f.mediaIds[i]!)),
    });
  };
  const undoRemove = () => {
    if (!removed) return;
    const putBack = (list: string[], items: string[]) => [...list.slice(0, removed.at), ...items, ...list.slice(removed.at)];
    set({ mediaIds: putBack(f.mediaIds, removed.ids), mediaUrls: putBack(f.mediaUrls, removed.urls) });
    setRemoved(null);
  };
  // The last picture removed stays where it was, greyed out, with a small button to put it back.
  const removedAt = removed ? groups.filter((g) => f.mediaIds.indexOf(g.ids[0]!) < removed.at).length : -1;
  const removedTile = removed && (
    <div className="media-tile removed">
      <img src={thumbUrl(removed.urls)} alt="" />
      <button
        type="button"
        className="remove"
        aria-label={removed.urls[0]!.endsWith('.mp4') ? 'Remettre la vidéo' : 'Remettre la photo'}
        onClick={undoRemove}
      >
        <Icon name="undo" size={16} />
      </button>
    </div>
  );

  // Sends a file or a link to the server, then adds what it kept: one video, or up to two photos
  // (start and end position, shown in a loop).
  const addMedia = async (message: string, send: () => Promise<{ ids: string[]; urls: string[] }>) => {
    setError(null);
    setBusy(message);
    try {
      const res = await send();
      setRemoved(null);
      if (res.ids.length === 2 || hasVideo) set({ mediaIds: res.ids, mediaUrls: res.urls });
      else set({ mediaIds: [...f.mediaIds, ...res.ids].slice(-2), mediaUrls: [...f.mediaUrls, ...res.urls].slice(-2) });
      return true;
    } catch (err) {
      setError(err instanceof UploadError ? err.message : 'Envoi impossible.');
      return false;
    } finally {
      setBusy(null);
    }
  };
  // Photos are framed first; videos and GIFs go as they are.
  const onFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    if (file.type.startsWith('video/') || file.type === 'image/gif') {
      await addMedia('Envoi et conversion de la vidéo…', () => uploadMedia(file));
      return;
    }
    const src = URL.createObjectURL(file);
    setCropping({
      src,
      message: 'Envoi de la photo…',
      send: (crop) => uploadMedia(file, crop ?? undefined),
      release: () => URL.revokeObjectURL(src),
    });
  };
  const onLink = () => {
    const url = link.trim();
    if (!url) return;
    setCropping({
      src: url,
      message: 'Import de l’image…',
      send: (crop) => importMediaFromUrl(url, crop ?? undefined),
      added: () => setLink(''),
    });
  };
  // `crop` undefined: framing cancelled (a link stays in its field, to be tried again).
  const closeCrop = async (crop: Crop | null | undefined) => {
    const c = cropping;
    setCropping(null);
    if (!c) return;
    if (crop !== undefined && (await addMedia(c.message, () => c.send(crop)))) c.added?.();
    c.release?.();
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('Donne un nom à l’exercice.');
    const fields = { ...f, instructions: steps.split('\n').map((s) => s.trim()).filter(Boolean) };
    const target = id ? (await updateExercise(id, fields), id) : await createExercise(fields);
    navigate(`/exercices/${target}`, { replace: true });
  };

  const builtin = existing?.source === 'builtin';

  return (
    <form className="page" style={{ maxWidth: 720 }} onSubmit={save}>
      <header className="row between">
        <Link to={id ? `/exercices/${id}` : '/exercices'} className="icon-btn" aria-label="Annuler">
          <Icon name="back" />
        </Link>
        <div className="row" style={{ gap: 4 }}>
          {builtin && existing?.customized && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!!busy}
              onClick={async () => {
                const sure = await ask({
                  title: 'Rétablir l’original ?',
                  message: 'L’exercice revient à la version de la bibliothèque. Tes changements seront perdus.',
                  confirm: 'Rétablir l’original',
                  danger: true,
                });
                if (!sure) return;
                setBusy('Retour à l’original…');
                try {
                  await resetExercise(id!);
                  navigate(`/exercices/${id}`, { replace: true });
                } catch {
                  setError('Serveur injoignable : réessaie une fois connecté.');
                  setBusy(null);
                }
              }}
            >
              Rétablir l’original
            </button>
          )}
          {existing?.source === 'custom' && (
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={async () => {
                const sure = await ask({
                  title: `Supprimer « ${existing.name} » ?`,
                  message: 'Il reste visible dans tes séances passées.',
                  confirm: 'Supprimer',
                  danger: true,
                });
                if (sure) {
                  await deleteExercise(existing.id);
                  navigate('/exercices', { replace: true });
                }
              }}
            >
              <Icon name="trash" size={18} />
              Supprimer
            </button>
          )}
        </div>
      </header>

      <h1 className="title">{id ? 'Modifier l’exercice' : 'Nouvel exercice'}</h1>
      {builtin && (
        <p className="small muted" style={{ margin: 0, lineHeight: 1.45 }}>
          Exercice de la bibliothèque : tes changements sont gardés comme ta version, sur tous tes appareils.
        </p>
      )}

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Nom</span>
        <input className="input" value={f.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. Fente bulgare" />
      </label>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Type d’exercice</span>
        <select className="input" value={f.exerciseType} onChange={(e) => set({ exerciseType: e.target.value as ExerciseType })}>
          {EXERCISE_TYPE_IDS.map((t) => (
            <option key={t} value={t}>
              {EXERCISE_TYPES[t].label}
            </option>
          ))}
        </select>
      </label>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="label">Muscles</h2>
        <span className="small muted">Clique une fois pour principal, deux fois pour secondaire.</span>
        <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="chips-wrap grow" role="group" aria-label="Muscles travaillés" style={{ flexBasis: 280 }}>
            {MUSCLE_IDS.map((m) => {
              const l = level(m);
              return (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  data-level={l ?? undefined}
                  aria-label={`${MUSCLES[m]} : ${l === 'primary' ? 'principal' : l === 'secondary' ? 'secondaire' : 'non travaillé'}`}
                  onClick={() => cycle(m)}
                >
                  {MUSCLES[m]}
                </button>
              );
            })}
          </div>
          <div className="card" style={{ display: 'flex', justifyContent: 'center', margin: '0 auto' }}>
            <BodyMap primary={f.primaryMuscles} secondary={f.secondaryMuscles} height={180} />
          </div>
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="label">Matériel</h2>
        <div className="chips-wrap" role="group" aria-label="Matériel">
          {Object.entries(EQUIPMENT_LABELS).map(([q, label]) => (
            <button key={q} type="button" className="chip" aria-pressed={f.equipment.includes(q)} onClick={() => toggleEquipment(q)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="label">Photo, GIF ou vidéo</h2>
        <span className="small muted" style={{ lineHeight: 1.45 }}>
          Une vidéo (15 s max, sans le son) ou deux photos, début et fin du mouvement, enchaînées en boucle. Fais
          glisser une photo pour changer leur ordre.
        </span>
        <div className="row wrap" style={{ gap: 10 }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onMediaMoved}>
            <SortableContext items={groups.map((g) => g.ids[0]!)} strategy={horizontalListSortingStrategy}>
              {groups.map((g, k) => (
                <Fragment key={g.ids[0]}>
                  {k === removedAt && removedTile}
                  <MediaTile
                    group={g}
                    label={photos === 2 && !hasVideo ? (k === 0 ? 'Début' : 'Fin') : null}
                    onRemove={() => removeGroup(g)}
                  />
                </Fragment>
              ))}
              {removedAt === groups.length && removedTile}
            </SortableContext>
          </DndContext>
          {(hasVideo || photos < 2) && (
            <button
              type="button"
              className="media-tile btn-dashed"
              style={{ border: '1.5px dashed var(--line)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--accent-text)' }}
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
              aria-label={hasVideo ? 'Remplacer la vidéo' : 'Ajouter une photo, un GIF ou une vidéo'}
            >
              <Icon name="plus" size={24} />
            </button>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input grow"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              // Enter imports the image instead of saving the whole exercise.
              if (e.key !== 'Enter') return;
              e.preventDefault();
              onLink();
            }}
            placeholder="Ou colle le lien d’une image"
            aria-label="Lien d’une image sur Internet"
            disabled={!!busy}
          />
          <button type="button" className="btn" disabled={!!busy || !link.trim()} onClick={onLink}>
            Importer
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {busy && (
          <span className="small" role="status" style={{ color: 'var(--accent-text)' }}>
            {busy}
          </span>
        )}
      </section>

      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Consignes</span>
        <textarea
          className="input"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder={'Une étape par ligne.\nEx. Dos droit, regard devant.'}
        />
      </label>

      {error && (
        <p className="small" role="alert" style={{ margin: 0, color: 'var(--warn)' }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={!!busy}>
        <Icon name="check" size={20} />
        Enregistrer
      </button>
      {cropping && (
        <CropSheet src={cropping.src} onCancel={() => void closeCrop(undefined)} onConfirm={(crop) => void closeCrop(crop)} />
      )}
    </form>
  );
}
