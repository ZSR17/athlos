import { createStore } from '../lib/store.ts';

// Per-device sync preferences (never synced themselves).
interface SyncSettings {
  // Only sync when the server sees the device on the home network.
  wifiOnly: boolean;
  // During a session nothing is exchanged; everything goes when the session is finished.
  endOnly: boolean;
  // Use the appearance shared by all devices instead of this device's own.
  shareAppearance: boolean;
  // The first-launch sync question has been answered.
  onboarded: boolean;
}

export const syncSettings = createStore<SyncSettings>(
  { wifiOnly: false, endOnly: false, shareAppearance: false, onboarded: false },
  'athlos.sync',
);

export function describeMode(s: Pick<SyncSettings, 'wifiOnly' | 'endOnly'>): { title: string; text: string } {
  if (s.wifiOnly && s.endOnly) {
    return {
      title: 'Fin de séance, à la maison',
      text: 'Envoi groupé à la fin de la séance si tu es chez toi, sinon dès ton retour sur ton Wi-Fi.',
    };
  }
  if (s.wifiOnly) {
    return {
      title: 'Temps réel, à la maison',
      text: 'Synchro instantanée à la maison. Dehors, tout est gardé sur l’appareil et envoyé à ton retour.',
    };
  }
  if (s.endOnly) {
    return {
      title: 'Fin de séance, partout',
      text: 'Aucun échange pendant l’entraînement, envoi en une fois (environ 10 Ko) quand tu appuies sur « Terminer ».',
    };
  }
  return {
    title: 'Temps réel, partout',
    text: 'Chaque série est envoyée dès que le serveur est joignable, à la maison ou en données mobiles. Moins de 50 Ko par séance.',
  };
}
