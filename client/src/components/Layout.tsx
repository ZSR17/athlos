import { useLiveQuery } from 'dexie-react-hooks';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { db } from '../db/db.ts';
import { Icon, type IconName } from './Icon.tsx';

// `short` replaces the label in the bottom tab bar, where long labels do not fit.
const NAV: { to: string; label: string; short?: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Séances', icon: 'home', end: true },
  { to: '/exercices', label: 'Exercices', icon: 'dumbbell' },
  { to: '/historique', label: 'Historique', icon: 'chart' },
  { to: '/disques', label: 'Calculateur de disques', short: 'Calculateur', icon: 'plate' },
  { to: '/1rm', label: 'Calculateur de 1RM', short: '1RM', icon: 'percent' },
  { to: '/reglages', label: 'Réglages', icon: 'settings' },
];

// Bottom tab bar in narrow windows, sidebar on wide screens (same app, see styles.css).
export function Layout() {
  const { pathname } = useLocation();
  const live = useLiveQuery(() => db.meta.get('live'), []);
  const showLive = !!live && pathname !== '/seance';

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navigation principale">
        <span className="brand">Halko</span>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <Icon name={n.icon} size={20} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        {showLive && (
          <Link to="/seance" className="live-banner">
            <span className="dot" aria-hidden="true" />
            Séance en cours
            <span className="grow" />
            Reprendre
            <Icon name="chevron" size={18} />
          </Link>
        )}
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Navigation principale">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <Icon name={n.icon} size={24} />
            {n.short ?? n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
