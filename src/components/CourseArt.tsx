import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';

type Paint = (name: string) => string;

const layers = (p: Paint) => (
  <>
    {[[34, 'sky', 0.75], [17, 'lilac', 0.85], [0, 'bloom', 1]].map(([y, fill, o]) => (
      <path key={y} transform={`translate(0 ${y})`} d="M50 14 84 31 50 48 16 31Z" fill={p(String(fill))} stroke={p(String(fill))} strokeWidth="7" strokeLinejoin="round" opacity={o} />
    ))}
    <path d="M50 12 82 28" stroke="#fff" strokeOpacity=".6" strokeWidth="1.5" strokeLinecap="round" />
  </>
);
const sphere = (p: Paint) => (
  <>
    <ellipse cx="50" cy="56" rx="44" ry="13" fill="none" stroke={p('sky')} strokeWidth="5" opacity=".8" transform="rotate(-18 50 56)" />
    <circle cx="50" cy="48" r="27" fill={p('ball')} />
    <path d="M9.5 66 C 22 76, 62 66, 91 44" fill="none" stroke={p('lilac')} strokeWidth="5" strokeLinecap="round" />
    <ellipse cx="41" cy="36" rx="9" ry="5.5" fill="#fff" opacity=".75" transform="rotate(-32 41 36)" />
  </>
);
const rings = (p: Paint) => (
  <>
    <circle cx="38" cy="42" r="21" fill="none" stroke={p('bloom')} strokeWidth="9" />
    <circle cx="62" cy="42" r="21" fill="none" stroke={p('sky')} strokeWidth="9" opacity=".9" />
    <circle cx="50" cy="61" r="21" fill="none" stroke={p('lilac')} strokeWidth="9" opacity=".92" />
    <path d="M22 34a18 18 0 0 1 11-9M56 26a18 18 0 0 1 12 0M34 72a18 18 0 0 1-2-9" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2" strokeLinecap="round" />
  </>
);
const discs = (p: Paint) => (
  <>
    {[[46, 'sky'], [26, 'lilac'], [6, 'bloom']].map(([y, fill]) => (
      <g key={y} transform={`translate(0 ${y})`}>
        <path d="M18 20v12c0 7 14 12 32 12s32-5 32-12V20Z" fill={p(String(fill))} />
        <ellipse cx="50" cy="20" rx="32" ry="11.5" fill={p(String(fill))} />
        <ellipse cx="50" cy="20" rx="32" ry="11.5" fill="#fff" opacity=".34" />
      </g>
    ))}
  </>
);
const cloud = (p: Paint) => (
  <>
    <circle cx="70" cy="38" r="19" fill={p('sky')} opacity=".85" />
    <path d="M28 72a17 17 0 0 1-2-34 23 23 0 0 1 44-5 20 20 0 0 1 4 39Z" fill={p('ball')} />
    <path d="M30 46a14 14 0 0 1 10-13" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="3.4" strokeLinecap="round" />
  </>
);
const ART: Record<string, (p: Paint) => ReactNode> = { js: layers, py: sphere, ml: rings, db: discs, cl: cloud };

/** Soft three-dimensional emblem for a course, drawn from the same gel palette as the skill blob. */
export function CourseArt({ skill, className }: { skill: string; className?: string }) {
  const id = useId();
  const p = (name: string) => `url(#${id}${name})`;
  const grad = (name: string, stops: string[]) => (
    <linearGradient id={id + name} x1="10" y1="0" x2="92" y2="96" gradientUnits="userSpaceOnUse">
      {stops.map((c, i) => (
        <stop key={c} offset={i / (stops.length - 1)} stopColor={c} />
      ))}
    </linearGradient>
  );
  return (
    <svg viewBox="0 0 100 100" className={cn('drop-shadow-[0_6px_8px_rgb(90_60_190/.32)]', className)} aria-hidden>
      <defs>
        {grad('bloom', ['#ffb7d8', '#d673f0', '#6a4df0'])}
        {grad('lilac', ['#e9dcff', '#b79bff', '#8f86f6'])}
        {grad('sky', ['#d6f4ff', '#7fc6ff', '#5fdcd8'])}
        <radialGradient id={`${id}ball`} cx="36" cy="28" r="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" />
          <stop offset=".3" stopColor="#f2c3f2" />
          <stop offset=".62" stopColor="#9a74f8" />
          <stop offset="1" stopColor="#5aa8ff" />
        </radialGradient>
      </defs>
      {(ART[skill] ?? layers)(p)}
    </svg>
  );
}
