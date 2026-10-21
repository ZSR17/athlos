import type { CSSProperties, ReactNode } from 'react';

const isVideo = (url: string) => url.endsWith('.mp4');

// Picture for lists: a video's poster, or the first photo.
export function thumbUrl(urls: string[]): string | undefined {
  return urls.find((u) => !isVideo(u));
}

// Built-in exercises have a start and an end photo: cross-fading them gives a GIF-like loop
// without storing an animation. Custom videos (and GIFs, converted to video) loop silently.
export function ExerciseMedia({
  urls,
  name,
  style,
  className = '',
  children,
}: {
  urls: string[];
  name: string;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}) {
  const video = urls.find(isVideo);
  const [a, b] = urls;
  return (
    <div className={`media ${className}`} style={style}>
      {video ? (
        <video src={video} poster={thumbUrl(urls)} autoPlay muted loop playsInline aria-label={name} />
      ) : (
        <>
          {a && <img src={a} alt={`${name}, position de départ`} />}
          {b && <img className="frame-b" src={b} alt="" />}
        </>
      )}
      {!a && <div className="media-empty" aria-hidden="true" />}
      {children}
    </div>
  );
}
