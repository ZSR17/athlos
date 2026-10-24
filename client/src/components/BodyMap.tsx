import { MUSCLES, type MuscleId } from '@halko/shared';
import bodyPaths from '../assets/body-paths.json';
import { type RegionState, regionState } from '../lib/muscles.ts';

// Anatomical outlines from react-native-body-highlighter (MIT, see assets/body-paths.LICENSE).
const PATHS = bodyPaths as { front: { r: string; d: string }[]; back: { r: string; d: string }[] };

const FILL: Record<RegionState, string> = {
  primary: 'var(--muscle-primary)',
  secondary: 'var(--muscle-secondary)',
  idle: 'var(--muscle-idle)',
  body: 'var(--body)',
};

interface Props {
  primary: readonly MuscleId[];
  secondary: readonly MuscleId[];
  height?: number;
  legend?: boolean;
  // Lets the settings preview show colours that are not applied yet.
  colors?: { primary: string; secondary: string };
}

function describe(primary: readonly MuscleId[], secondary: readonly MuscleId[]) {
  const names = (ids: readonly MuscleId[]) => ids.map((m) => MUSCLES[m].toLowerCase()).join(', ');
  const parts = [];
  if (primary.length) parts.push(`principaux : ${names(primary)}`);
  if (secondary.length) parts.push(`secondaires : ${names(secondary)}`);
  return `Muscles sollicités${parts.length ? ` — ${parts.join(' ; ')}` : ''}`;
}

export function BodyMap({ primary, secondary, height = 220, legend = true, colors }: Props) {
  const fill = (s: RegionState) =>
    colors && s === 'primary' ? colors.primary : colors && s === 'secondary' ? colors.secondary : FILL[s];
  const view = (side: 'front' | 'back') => (
    <svg
      width={height / 2}
      height={height}
      viewBox={side === 'front' ? '0 0 724 1448' : '724 0 724 1448'}
      aria-hidden="true"
    >
      {PATHS[side].map((p, i) => (
        <path key={i} d={p.d} fill={fill(regionState(p.r, primary, secondary))} />
      ))}
    </svg>
  );
  return (
    <figure role="img" aria-label={describe(primary, secondary)} style={{ margin: 0 }}>
      <div style={{ display: 'flex', gap: height < 140 ? 2 : 16, justifyContent: 'center' }}>
        {view('front')}
        {view('back')}
      </div>
      {legend && (
        <figcaption className="row small" style={{ justifyContent: 'center', gap: 14, marginTop: 6 }}>
          <span className="row" style={{ gap: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: fill('primary') }} />
            Principal
          </span>
          <span className="row" style={{ gap: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: fill('secondary') }} />
            Secondaire
          </span>
        </figcaption>
      )}
    </figure>
  );
}
