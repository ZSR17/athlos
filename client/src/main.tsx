// First: moves what the browser kept under the app's former name before anything reads it.
import { moveLocalDatabase } from './lib/rename.ts';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { db } from './db/db.ts';
import { applyAppearance } from './lib/appearance.ts';

applyAppearance();

void moveLocalDatabase(db).finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
