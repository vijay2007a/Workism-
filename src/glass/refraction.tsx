import { useEffect, useId, useState, type RefObject } from 'react';
import { useLite } from '../lib/effects';

// Only Chromium draws SVG filters inside backdrop-filter; elsewhere the plain frosted glass stands.
const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
const supported = brands.some((b) => b.brand === 'Chromium');

/** Displacement map for a rounded pane: neutral in the middle, bending light only within its rim. */
function lens(w: number, h: number, radius: number) {
  const b = Math.min(22, Math.min(w, h) / 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="x" x1="1" x2="0"><stop stop-color="#000"/><stop offset="1" stop-color="red"/></linearGradient><linearGradient id="y" x2="0" y2="1"><stop stop-color="#000"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><rect width="${w}" height="${h}"/><rect width="${w}" height="${h}" rx="${radius}" fill="url(#x)"/><rect width="${w}" height="${h}" rx="${radius}" fill="url(#y)" style="mix-blend-mode:difference"/><rect x="${b / 2}" y="${b / 2}" width="${w - b}" height="${h - b}" rx="${radius - b / 4}" fill="rgb(128 128 128 / .94)" style="filter:blur(${b / 2}px)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Bends whatever lies behind a floating pane, as thick glass does. Text on the pane is never distorted. */
export function useRefraction(ref: RefObject<HTMLElement | null>) {
  const id = `lens${useId().replace(/[^\w]/g, '')}`;
  const lite = useLite();
  const [map, setMap] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (!supported || lite || !el || matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
    const size = new ResizeObserver(() => setMap(lens(el.offsetWidth, el.offsetHeight, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24)));
    size.observe(el);
    el.style.backdropFilter = `url(#${id}) blur(11px) saturate(1.7)`;
    return () => {
      size.disconnect();
      el.style.backdropFilter = '';
    };
  }, [ref, id, lite]);

  if (!map) return null;
  return (
    <svg className="pointer-events-none absolute size-0" aria-hidden>
      <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
        {/* Red, green and blue bend by slightly different amounts: a thin rainbow at the rim. */}
        <feDisplacementMap in="SourceGraphic" in2="map" scale="-54" xChannelSelector="R" yChannelSelector="B" result="r0" />
        <feColorMatrix in="r0" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="-50" xChannelSelector="R" yChannelSelector="B" result="g0" />
        <feColorMatrix in="g0" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="-46" xChannelSelector="R" yChannelSelector="B" result="b0" />
        <feColorMatrix in="b0" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b" />
        <feBlend in="r" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b" mode="screen" />
      </filter>
    </svg>
  );
}
