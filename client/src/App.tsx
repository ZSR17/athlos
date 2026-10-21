import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { getToken, onUnauthorized } from './lib/api.ts';
import { ExerciseDetail } from './pages/ExerciseDetail.tsx';
import { ExerciseEditor } from './pages/ExerciseEditor.tsx';
import { History } from './pages/History.tsx';
import { Home } from './pages/Home.tsx';
import { Library } from './pages/Library.tsx';
import { LiveSession } from './pages/LiveSession.tsx';
import { Login } from './pages/Login.tsx';
import { Onboarding } from './pages/Onboarding.tsx';
import { SessionDetail } from './pages/SessionDetail.tsx';
import { Settings } from './pages/Settings.tsx';
import { WorkoutEditor } from './pages/WorkoutEditor.tsx';
import { startSync } from './sync/engine.ts';
import { syncSettings } from './sync/settings.ts';

export function App() {
  const [authed, setAuthed] = useState(() => getToken() !== null);
  const { onboarded } = syncSettings.use();

  useEffect(() => onUnauthorized(() => setAuthed(false)), []);

  // Sync runs for as long as the device is logged in; offline it just waits.
  useEffect(() => (authed && onboarded ? startSync() : undefined), [authed, onboarded]);

  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;
  if (!onboarded) return <Onboarding />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="exercices" element={<Library />} />
          <Route path="exercices/nouveau" element={<ExerciseEditor />} />
          <Route path="exercices/:id" element={<ExerciseDetail />} />
          <Route path="exercices/:id/modifier" element={<ExerciseEditor />} />
          <Route path="seances/:id" element={<WorkoutEditor />} />
          <Route path="seance" element={<LiveSession />} />
          <Route path="historique" element={<History />} />
          <Route path="historique/:id" element={<SessionDetail />} />
          <Route path="reglages" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
