import type { Crop } from '@athlos/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet.tsx';

// Exercise pictures are shown in landscape 3:2 frames.
const RATIO = 3 / 2;
const MAX_ZOOM = 4;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Part of the picture kept for a zoom and a centre (fractions of the picture): at zoom 1 the frame
// covers the picture as much as it can, like the pictures are shown.
function cropFor(natural: { w: number; h: number }, zoom: number, center: { x: number; y: number }): Crop {
  const aspect = natural.w / natural.h;
  const w = (aspect > RATIO ? RATIO / aspect : 1) / zoom;
  const h = (aspect > RATIO ? 1 : aspect / RATIO) / zoom;
  return { w, h, x: clamp(center.x - w / 2, 0, 1 - w), y: clamp(center.y - h / 2, 0, 1 - h) };
}

// Choosing the part of a photo to keep: drag to move it, mouse wheel or slider to zoom. `src` is a link
// or an object URL; when the picture cannot be shown here, it can still be sent as it is.
export function CropSheet({ src, onCancel, onConfirm }: { src: string; onCancel: () => void; onConfirm: (crop: Crop | null) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The wheel zooms instead of scrolling the sheet (React wheel listeners cannot prevent that).
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.002), 1, MAX_ZOOM));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const crop = natural && cropFor(natural, zoom, center);
  const shownW = crop ? width / crop.w : 0;
  const shownH = crop ? width / RATIO / crop.h : 0;

  return (
    <Sheet title="Cadrer la photo" onClose={onCancel}>
      <span className="small muted">Fais glisser la photo pour la placer, zoome avec la molette ou le curseur.</span>
      <div
        ref={frame}
        className="crop-frame"
        onPointerDown={(e) => {
          if (!crop) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !crop) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          // Kept part's centre, from where it really is (the edges stop it).
          setCenter({ x: crop.x + crop.w / 2 - dx / shownW, y: crop.y + crop.h / 2 - dy / shownH });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {!failed && (
          <img
            src={src}
            alt="Photo à cadrer"
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setFailed(true)}
            style={
              crop
                ? { width: shownW, height: shownH, left: -crop.x * shownW, top: -crop.y * shownH }
                : { visibility: 'hidden' }
            }
          />
        )}
        {failed && (
          <p className="small muted" style={{ margin: 0, padding: 16, textAlign: 'center' }}>
            Aperçu impossible ici : la photo sera gardée en entier.
          </p>
        )}
      </div>
      {!failed && (
        <input
          type="range"
          className="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          disabled={!crop}
        />
      )}
      <button type="button" className="btn btn-primary" disabled={!crop && !failed} onClick={() => onConfirm(failed ? null : crop)}>
        {failed ? 'Ajouter sans cadrer' : 'Valider le cadrage'}
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        Annuler
      </button>
    </Sheet>
  );
}
