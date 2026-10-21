import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { SyncBadge } from '../components/SyncBadge.tsx';
import { db } from '../db/db.ts';
import { createWorkout } from '../db/workouts.ts';
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

export function Home() {
  const navigate = useNavigate();
  const start = useStartSession();
  const workouts = useWorkoutSummaries();
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const create = async () => navigate(`/seances/${await createWorkout('Nouvelle séance')}`);

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
        {workouts?.map((w) => (
          <div key={w.id} className="list-item" style={{ padding: '10px 10px 10px 14px', cursor: 'default' }}>
            <Link to={`/seances/${w.id}`} className="row grow" style={{ textDecoration: 'none', color: 'var(--text)' }}>
              <span
                className="num"
                style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, background: 'var(--surface2)', display: 'grid', placeItems: 'center', color: 'var(--accent-text)', fontSize: 18 }}
                aria-hidden="true"
              >
                {w.name.charAt(0).toUpperCase()}
              </span>
              <span className="grow stack" style={{ gap: 2 }}>
                <span className="ellipsis" style={{ fontWeight: 700 }}>
                  {w.name}
                </span>
                <span className="small muted">
                  {w.exercises} exercice{w.exercises > 1 ? 's' : ''} · {w.sets} série{w.sets > 1 ? 's' : ''}
                </span>
              </span>
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 44, padding: '0 14px' }}
              onClick={() => start(w.id)}
              disabled={w.exercises === 0}
              aria-label={`Démarrer ${w.name}`}
            >
              <Icon name="play" size={18} />
              Démarrer
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-dashed" onClick={create}>
        <Icon name="plus" size={20} />
        Nouvelle séance
      </button>
    </div>
  );
}
