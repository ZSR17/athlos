import { useNavigate } from 'react-router-dom';
import { ask } from '../components/Dialog.tsx';
import { getLive, startSession } from '../db/sessions.ts';
import { unlockAudio } from './feedback.ts';

// Starts a workout, or brings back the session already in progress (only one at a time).
export function useStartSession() {
  const navigate = useNavigate();
  return async (workoutId: string) => {
    unlockAudio();
    const live = await getLive();
    if (live && live.workoutId !== workoutId) {
      await ask({
        title: 'Une séance est déjà en cours',
        message: 'Termine-la ou abandonne-la avant d’en commencer une autre.',
        confirm: 'Voir la séance en cours',
        cancel: null,
      });
    } else if (!live) {
      await startSession(workoutId);
    }
    navigate('/seance');
  };
}
