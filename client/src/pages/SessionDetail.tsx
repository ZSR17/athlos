import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { thumbUrl } from '../components/ExerciseMedia.tsx';
import { Icon } from '../components/Icon.tsx';
import { type LocalExercise, type LocalSetLog, db } from '../db/db.ts';
import { deleteSession, exerciseHistory, sessionLogs } from '../db/sessions.ts';
import { formatSetValues } from '../lib/format.ts';
import { metricsForType, recordFor } from '../lib/progress.ts';
import { formatMinutes, formatTonnage, sessionDurationMs, sessionVolumeG } from '../lib/stats.ts';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Group {
  exercise: LocalExercise | undefined;
  exerciseId: string;
  sets: LocalSetLog[];
  records: string[];
}

export function SessionDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session || session.deleted) return null;
    const logs = await sessionLogs(id);
    const ids = [...new Set(logs.sort((a, b) => a.position - b.position || a.setIndex - b.setIndex).map((l) => l.exerciseId))];
    const exercises = await db.exercises.bulkGet(ids);
    const groups: Group[] = [];
    for (const [k, exerciseId] of ids.entries()) {
      const exercise = exercises[k];
      const sets = logs.filter((l) => l.exerciseId === exerciseId).sort((a, b) => a.setIndex - b.setIndex);
      const earlier = (await exerciseHistory(exerciseId)).filter((h) => h.session.startedAt < session.startedAt).map((h) => h.sets);
      const records = exercise
        ? metricsForType(exercise.exerciseType).flatMap((m) => {
            const r = recordFor(m, earlier, sets);
            return r ? [`${m.label} : ${m.format(r.value)} (avant ${m.format(r.previous)})`] : [];
          })
        : [];
      groups.push({ exercise, exerciseId, sets, records });
    }
    const types = new Map(exercises.filter((e) => !!e).map((e) => [e!.id, e!.exerciseType]));
    return { session, logs, groups, volume: sessionVolumeG(logs, types) };
  }, [id]);

  if (data === undefined) return <div className="page muted">Chargement…</div>;
  if (data === null) {
    return (
      <div className="page">
        <p>Séance introuvable.</p>
        <Link to="/historique">Retour à l'historique</Link>
      </div>
    );
  }
  const { session, logs, groups, volume } = data;
  const records = groups.flatMap((g) => g.records.map((r) => `${g.exercise?.name ?? ''} — ${r}`));

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header className="row">
        <Link to="/historique" className="icon-btn" aria-label="Retour à l'historique">
          <Icon name="back" />
        </Link>
        <div className="grow" />
        <button
          type="button"
          className="btn btn-ghost btn-danger"
          onClick={async () => {
            if (confirm('Supprimer cette séance de l’historique ?')) {
              await deleteSession(id);
              navigate('/historique');
            }
          }}
        >
          <Icon name="trash" size={18} />
          Supprimer
        </button>
      </header>

      {params.get('fin') && (
        <p role="status" className="record" style={{ alignSelf: 'flex-start', fontSize: 14 }}>
          <Icon name="check" size={16} strokeWidth={3} />
          Séance enregistrée
        </p>
      )}
      <div className="stack" style={{ gap: 4 }}>
        <h1 className="title">{session.name}</h1>
        <span className="muted">{capitalize(dateFmt.format(session.startedAt))}</span>
      </div>

      <section className="stats">
        <div className="stat">
          <span className="value">{formatMinutes(sessionDurationMs(session))}</span>
          <span className="small muted">durée</span>
        </div>
        <div className="stat">
          <span className="value">{logs.length}</span>
          <span className="small muted">séries</span>
        </div>
        {volume > 0 && (
          <div className="stat">
            <span className="value">{formatTonnage(volume)}</span>
            <span className="small muted">volume</span>
          </div>
        )}
      </section>

      {records.length > 0 && (
        <section className="card stack" style={{ gap: 8 }}>
          <h2 className="label">Records battus</h2>
          {records.map((r) => (
            <span key={r} className="row" style={{ gap: 8, fontWeight: 600 }}>
              <span className="check on" aria-hidden="true">
                <Icon name="chart" size={14} />
              </span>
              {r}
            </span>
          ))}
        </section>
      )}

      {groups.map((g) => (
        <section key={g.exerciseId} className="card stack" style={{ gap: 10 }}>
          <Link to={`/exercices/${g.exerciseId}`} className="row" style={{ textDecoration: 'none', color: 'var(--text)' }}>
            <img className="thumb thumb-sm" src={thumbUrl(g.exercise?.mediaUrls ?? [])} alt="" />
            <span className="grow" style={{ fontWeight: 700 }}>
              {g.exercise?.name ?? 'Exercice'}
            </span>
          </Link>
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {g.sets.map((s, k) => (
              <li key={s.id} className="row small" style={{ gap: 12 }}>
                <span style={{ width: 52, fontWeight: 700, color: s.kind === 'warmup' ? 'var(--warn)' : 'var(--muted)' }}>
                  {s.kind === 'warmup' ? 'Écha.' : `Série ${g.sets.slice(0, k + 1).filter((x) => x.kind !== 'warmup').length}`}
                </span>
                <span className="num" style={{ fontSize: 17 }}>
                  {g.exercise ? formatSetValues(g.exercise.exerciseType, s) : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
