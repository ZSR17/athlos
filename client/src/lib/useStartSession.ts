import { useNavigate } from 'react-router-dom';
import { getLive, startSession } from '../db/sessions.ts';
import { unlockAudio } from './feedback.ts';

// Starts a workout, or brings back the session already in progress (only one at a time).
export function useStartSession() {
  const navigate = useNavigate();
  return async (workoutId: string) => {
    unlockAudio();
    const live = await getLive();
    if (live && live.workoutId !== workoutId) {
      alert('Une séance est déjà en cours : termine-la ou abandonne-la avant d’en commencer une autre.');
    } else if (!live) {
      await startSession(workoutId);
    }
    navigate('/seance');
  };
}
