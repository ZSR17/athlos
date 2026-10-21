import { Link } from 'react-router-dom';
import { ExerciseList } from '../components/ExerciseList.tsx';
import { Icon } from '../components/Icon.tsx';

export function Library() {
  return (
    <div className="page">
      <header className="row between">
        <h1 className="title">Exercices</h1>
        <Link to="/exercices/nouveau" className="btn btn-ghost">
          <Icon name="plus" size={18} />
          Créer
        </Link>
      </header>
      <ExerciseList />
    </div>
  );
}
