import { EQUIPMENT_LABELS, EXERCISE_TYPES, MUSCLES } from '@halko/shared';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap.tsx';
import { ExerciseMedia } from '../components/ExerciseMedia.tsx';
import { ExerciseProgress } from '../components/ExerciseProgress.tsx';
import { Icon } from '../components/Icon.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { db } from '../db/db.ts';
import { exerciseHistory } from '../db/sessions.ts';
import { addItem, createWorkout } from '../db/workouts.ts';
import { metricLongLabel, metricsFor } from '../lib/targets.ts';

const LEVELS: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', expert: 'Expert' };

export function ExerciseDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const exercise = useLiveQuery(() => db.exercises.get(id), [id]);
  const workouts = useLiveQuery(() => db.workouts.orderBy('position').filter((w) => !w.deleted).toArray(), []);
  const history = useLiveQuery(() => exerciseHistory(id), [id]);
  const [bigMap, setBigMap] = useState(false);
  const [picking, setPicking] = useState(false);

  if (exercise === undefined) return <div className="page muted">Chargement…</div>;
  if (exercise === null) return <div className="page">Exercice introuvable.</div>;

  const addTo = async (workoutId: string) => {
    await addItem(workoutId, exercise);
    navigate(`/seances/${workoutId}`);
  };

  return (
    <div className="page page-hero" style={{ maxWidth: 820 }}>
      <ExerciseMedia urls={exercise.mediaUrls} name={exercise.name} className="hero-media">
        <Link
          to="/exercices"
          // Back where the exercise was opened from (a workout, the history…); the library otherwise.
          onClick={(e) => {
            if (location.key === 'default') return;
            e.preventDefault();
            navigate(-1);
          }}
          className="icon-btn"
          aria-label="Retour"
          style={{ position: 'absolute', top: 14, left: 16, background: 'rgb(14 16 18 / .7)', color: '#fff' }}
        >
          <Icon name="back" />
        </Link>
        <Link
          to={`/exercices/${exercise.id}/modifier`}
          className="icon-btn"
          aria-label="Modifier l’exercice"
          style={{ position: 'absolute', top: 14, right: 16, background: 'rgb(14 16 18 / .7)', color: '#fff' }}
        >
          <Icon name="pencil" />
        </Link>
        <button
          type="button"
          onClick={() => setBigMap((v) => !v)}
          aria-label={bigMap ? 'Réduire la carte des muscles' : 'Agrandir la carte des muscles'}
          aria-expanded={bigMap}
          style={{ position: 'absolute', right: 12, bottom: 12, padding: 6, borderRadius: 12, border: 0, background: 'var(--surface)', cursor: 'pointer' }}
        >
          <BodyMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} height={96} legend={false} />
        </button>
      </ExerciseMedia>

      <div className="stack" style={{ gap: 8 }}>
        <h1 className="title" style={{ fontSize: 34 }}>
          {exercise.name}
        </h1>
        <div className="row wrap" style={{ gap: 8 }}>
          {exercise.equipment.map((q) => (
            <span key={q} className="tag">
              {EQUIPMENT_LABELS[q] ?? q}
            </span>
          ))}
          {exercise.level && <span className="tag">{LEVELS[exercise.level] ?? exercise.level}</span>}
        </div>
      </div>

      {bigMap && (
        <div className="card" style={{ display: 'flex', justifyContent: 'center' }}>
          <BodyMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} height={220} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div className="card stack" style={{ gap: 6 }}>
          <span className="row small" style={{ gap: 6, fontWeight: 700 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--muscle-primary)' }} />
            Principaux
          </span>
          <span style={{ fontWeight: 600 }}>{exercise.primaryMuscles.map((m) => MUSCLES[m]).join(', ') || '—'}</span>
        </div>
        <div className="card stack" style={{ gap: 6 }}>
          <span className="row small" style={{ gap: 6, fontWeight: 700 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--muscle-secondary)' }} />
            Secondaires
          </span>
          <span style={{ fontWeight: 600 }}>{exercise.secondaryMuscles.map((m) => MUSCLES[m]).join(', ') || '—'}</span>
        </div>
      </div>
      {exercise.source === 'builtin' && (
        <span className="small muted">{exercise.customized ? 'Ta version de l’exercice' : 'Muscles : free-exercise-db'}</span>
      )}

      <div className="card row between wrap">
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">Type d'exercice</span>
          <span style={{ fontWeight: 700 }}>{EXERCISE_TYPES[exercise.exerciseType].label}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {metricsFor(exercise.exerciseType).map((m) => (
            <span key={m} className="tag">
              {metricLongLabel(m, exercise.exerciseType)}
            </span>
          ))}
        </div>
      </div>

      {!!history?.length && (
        <section className="stack">
          <h2 className="label">Historique</h2>
          <ExerciseProgress exercise={exercise} history={history} />
        </section>
      )}

      {exercise.instructions.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="label">Exécution</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.5, color: 'var(--muted)' }}>
            {exercise.instructions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
        <Icon name="plus" size={20} />
        Ajouter à une séance
      </button>

      {picking && (
        <Sheet title="Ajouter à une séance" onClose={() => setPicking(false)}>
          {workouts?.map((w) => (
            <button key={w.id} type="button" className="list-item" onClick={() => addTo(w.id)}>
              <span className="grow" style={{ fontWeight: 700 }}>
                {w.name}
              </span>
              <Icon name="chevron" size={18} />
            </button>
          ))}
          <button type="button" className="btn btn-dashed" onClick={async () => addTo(await createWorkout('Nouvelle séance'))}>
            <Icon name="plus" size={20} />
            Nouvelle séance
          </button>
        </Sheet>
      )}
    </div>
  );
}
