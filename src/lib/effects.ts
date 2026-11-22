import { useCallback, useSyncExternalStore } from 'react';
import { useStore } from './store';

export function useMedia(query: string) {
  const subscribe = useCallback(
    (fn: () => void) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches);
}

/** Motion off: the OS asks for it, or the learner did in Settings. */
export function useCalm() {
  const os = useMedia('(prefers-reduced-motion: reduce)');
  return useStore((s) => s.settings.motion) === 'reduced' || os;
}

/** Cheaper materials: phones, small machines, or by choice. */
export function useLite() {
  const small = useMedia('(pointer: coarse), (max-width: 45.99rem)');
  const choice = useStore((s) => s.settings.effects);
  if (choice !== 'auto') return choice === 'light';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return small || memory <= 2 || navigator.hardwareConcurrency <= 2;
}

/** One listener lights whichever glass surface is under the pointer (see --mx/--my in index.css). */
export function trackPointerLight() {
  let queued: PointerEvent | null = null;
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      if (!queued) requestAnimationFrame(flush);
      queued = e;
    },
    { passive: true },
  );
  function flush() {
    const e = queued;
    queued = null;
    const el = (e?.target as Element | null)?.closest?.<HTMLElement>('.lg-light');
    if (!e || !el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
}
