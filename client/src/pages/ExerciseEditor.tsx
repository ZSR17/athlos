import { EQUIPMENT_LABELS, EXERCISE_TYPE_IDS, EXERCISE_TYPES, type ExerciseType, MUSCLE_IDS, MUSCLES, type MuscleId } from '@athlos/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap.tsx';
import { thumbUrl } from '../components/ExerciseMedia.tsx';
import { Icon } from '../components/Icon.tsx';
import { db } from '../db/db.ts';
import {
  type ExerciseFields,
  UploadError,
  createExercise,
  deleteExercise,
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
  const fileInput = useRef<HTMLInputElement>(null);

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
  // Tap: none -> main -> secondary -> none.
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
  const removeGroup = (g: { ids: string[] }) =>
    set({
      mediaIds: f.mediaIds.filter((x) => !g.ids.includes(x)),
      mediaUrls: f.mediaUrls.filter((_, i) => !g.ids.includes(f.mediaIds[i]!)),
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(file.type.startsWith('video/') || file.type === 'image/gif' ? 'Envoi et conversion de la vidéo…' : 'Envoi de la photo…');
    try {
      const res = await uploadMedia(file);
      const isVideo = res.ids.length === 2;
      // One video, or up to two photos (start and end position, shown in a loop).
      if (isVideo || hasVideo) set({ mediaIds: res.ids, mediaUrls: res.urls });
      else set({ mediaIds: [...f.mediaIds, ...res.ids].slice(-2), mediaUrls: [...f.mediaUrls, ...res.urls].slice(-2) });
    } catch (err) {
      setError(err instanceof UploadError ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
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
                if (!confirm('Revenir à la version d’origine de la bibliothèque ? Tes changements seront perdus.')) return;
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
                if (confirm(`Supprimer « ${existing.name} » ? Il reste visible dans tes séances passées.`)) {
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
        <span className="small muted">Touche une fois pour principal, deux fois pour secondaire.</span>
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
          Une vidéo (15 s max, sans le son) ou deux photos, début et fin du mouvement, enchaînées en boucle.
        </span>
        <div className="row wrap" style={{ gap: 10 }}>
          {groups.map((g) => (
            <div key={g.ids[0]} className="media-tile">
              <img src={thumbUrl(g.urls)} alt="" />
              {g.urls[0]!.endsWith('.mp4') && <span className="badge">Vidéo</span>}
              <button type="button" className="remove" aria-label="Retirer" onClick={() => removeGroup(g)}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
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
    </form>
  );
}
