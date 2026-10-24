import type { CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon.tsx';

// Leaves the page the way it was entered: back in the browser history, so the previous page is not
// opened a second time (a later « back » would then return here). `to` when there is no earlier page
// in the app (opened from a link or a bookmark).
export function useLeave() {
  const navigate = useNavigate();
  const location = useLocation();
  return (to: string) => (location.key === 'default' ? navigate(to, { replace: true }) : navigate(-1));
}

// Back arrow of a page; with `history` false, it always goes to `to`.
export function BackLink({
  to,
  label = 'Retour',
  history = true,
  style,
}: {
  to: string;
  label?: string;
  history?: boolean;
  style?: CSSProperties;
}) {
  const leave = useLeave();
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (!history) return;
        e.preventDefault();
        leave(to);
      }}
      className="icon-btn"
      aria-label={label}
      style={style}
    >
      <Icon name="back" />
    </Link>
  );
}
