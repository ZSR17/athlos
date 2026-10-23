import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { applyAppearance } from './lib/appearance.ts';

applyAppearance();
// Athlos used to be an installable app with a service worker: remove it where it is still there.
void navigator.serviceWorker?.getRegistrations().then((registrations) => registrations.forEach((r) => void r.unregister()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
