import { useEffect, useId, useRef, useState } from 'react';
import { contourPath, createJelly, scoreRadius, skillAngle, type Jelly } from '../lib/blob';
import { cn } from '../lib/cn';
import { useCalm, useLite } from '../lib/effects';
import { useI18n } from '../lib/i18n';
import { createBlobGl, VIEW, type BlobScene } from './blobGl';

export interface BlobSkill { id: string; name: string; score: number }

interface Props {
  skills: readonly BlobSkill[];
  active?: string | null;
  onActive?: (id: string | null) => void;
  /** Adds the 50 and 100 guide rings and permanent labels, for the large view. */
  detailed?: boolean;
  className?: string;
}

/** Living jelly whose lobes are the learner's skills. The white pins mark exact scores and never move with the jelly. */
export function LiquidSkillBlob({ skills, active = null, onActive, detailed, className }: Props) {
  const { t, percent } = useI18n();
  const calm = useCalm();
  const lite = useLite();
  const [webgl, setWebgl] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const jelly = useRef<Jelly>(null);
  const latest = useRef({ skills, active });
  const redraw = useRef<(() => void) | null>(null);
  const id = useId();

  useEffect(() => {
    const el = stage.current!;
    const area = wrap.current!;
    const scores = () => latest.current.skills.map((s) => s.score);
    let body = createJelly(scores());
    jelly.current = body;

    let painter: { resize(): void; paint(j: Jelly, s: BlobScene): void; dispose(): void };
    try {
      painter = webgl ? createBlobGl(el, lite ? 1.25 : 1.75, () => setWebgl(false)) : svgPainter(el);
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- a failed GPU context can only be discovered here
      setWebgl(false);
      return;
    }

    const scene: BlobScene = { time: 8, pointer: [0, 0, 0], hot: [1, 0, 0], ripples: [] };
    let near = false;
    let visible = false;
    let raf = 0;
    let last = 0;
    let skip = false;

    const aimHot = (blend: number) => {
      const list = latest.current.skills;
      const i = list.findIndex((s) => s.id === latest.current.active);
      if (i >= 0) {
        const a = skillAngle(i, list.length);
        scene.hot[0] = Math.cos(a);
        scene.hot[1] = Math.sin(a);
      }
      scene.hot[2] += ((i >= 0 ? 1 : 0) - scene.hot[2]) * blend;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Small devices idle at half rate and wake to full rate when touched.
      skip = lite && !near && scene.ripples.length === 0 && !skip;
      if (skip) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      scene.time += dt;
      scene.pointer[2] += ((near ? 1 : 0) - scene.pointer[2]) * Math.min(1, dt * 6);
      scene.ripples = scene.ripples.map((r) => ({ ...r, age: r.age + dt })).filter((r) => r.age < 2.2);
      aimHot(Math.min(1, dt * 9));
      body.step(dt);
      painter.paint(body, scene);
    };
    const still = () => {
      body = createJelly(scores());
      aimHot(1);
      painter.paint(body, scene);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (calm) return still();
      if (!visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    redraw.current = calm ? still : null;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      const radius = r.width / 2 / VIEW;
      return [(e.clientX - r.left - r.width / 2) / radius, (e.clientY - r.top - r.height / 2) / radius] as const;
    };
    const onMove = (e: PointerEvent) => {
      if (!visible) return;
      const [x, y] = local(e);
      near = Math.hypot(x, y) < 1.5;
      if (near) {
        body.point(x, y);
        scene.pointer[0] = x;
        scene.pointer[1] = y;
      } else body.leave();
    };
    const onLeave = () => {
      near = false;
      body.leave();
    };
    const poke = (x: number, y: number) => {
      body.poke(x, y);
      scene.ripples = [{ x, y, age: 0, strength: 1 }, ...scene.ripples].slice(0, 3);
    };
    const onDown = (e: PointerEvent) => {
      const [x, y] = local(e);
      if (Math.hypot(x, y) < 1.1) poke(x, y);
    };
    const onKeyPoke = (e: MouseEvent) => {
      // detail 0 is a keyboard press on a pin; real pointers were handled on pointerdown.
      if (e.detail === 0 && e.target instanceof Element) {
        const r = e.target.getBoundingClientRect();
        poke(...local({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      }
    };

    const sizes = new ResizeObserver(() => {
      painter.resize();
      painter.paint(body, scene);
    });
    sizes.observe(el);
    const views = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    views.observe(el);
    if (!calm) {
      addEventListener('pointermove', onMove, { passive: true });
      addEventListener('pointerup', onUp, { passive: true });
      addEventListener('pointercancel', onLeave, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      document.addEventListener('visibilitychange', start);
      area.addEventListener('pointerdown', onDown, { passive: true });
      area.addEventListener('click', onKeyPoke);
    }
    function onUp(e: PointerEvent) {
      if (e.pointerType !== 'mouse') onLeave();
    }

    return () => {
      cancelAnimationFrame(raf);
      sizes.disconnect();
      views.disconnect();
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onLeave);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', start);
      area.removeEventListener('pointerdown', onDown);
      area.removeEventListener('click', onKeyPoke);
      redraw.current = null;
      painter.dispose();
    };
  }, [webgl, calm, lite]);

  useEffect(() => {
    latest.current = { skills, active };
    redraw.current?.();
  }, [skills, active]);

  const scoreKey = skills.map((s) => s.score).join();
  useEffect(() => {
    jelly.current?.setScores(latest.current.skills.map((s) => s.score));
  }, [scoreKey]);

  const at = (r: number, a: number) => ({
    left: `${50 + 50 * r * Math.cos(a)}%`,
    top: `${50 + 50 * r * Math.sin(a)}%`,
  });

  return (
    <div ref={wrap} role="group" aria-label={t('Skill profile')} className={cn('lg-blob', className)}>
      <svg className="lg-blob-rings" viewBox="-100 -100 200 200" aria-hidden>
        <circle r={scoreRadius(100) * 100} />
        {detailed && <circle r={scoreRadius(50) * 100} strokeDasharray="1.5 4" />}
      </svg>
      <div ref={stage} className="lg-blob-stage" style={{ inset: `${(1 - VIEW) * 50}%` }} aria-hidden>
        {!webgl && <BlobSvg id={id} />}
      </div>
      {skills.map((s, i) => {
        const a = skillAngle(i, skills.length);
        const label = `${s.name}: ${percent(s.score)}`;
        return (
          <button
            key={s.id}
            type="button"
            className="lg-blob-pin"
            data-active={active === s.id || undefined}
            style={at(scoreRadius(s.score), a)}
            aria-label={label}
            onPointerEnter={() => onActive?.(s.id)}
            onPointerLeave={() => onActive?.(null)}
            onFocus={() => onActive?.(s.id)}
            onBlur={() => onActive?.(null)}
          >
            <span className="lg-blob-tip" data-below={Math.sin(a) > 0.2 || undefined} data-shown={active === s.id || undefined}>
              {label}
            </span>
          </button>
        );
      })}
      {detailed &&
        skills.map((s, i) => {
          const a = skillAngle(i, skills.length);
          return (
            <span
              key={s.id}
              className="lg-blob-label"
              data-active={active === s.id || undefined}
              style={{ ...at(1.04, a), transform: `translate(${-50 + 50 * Math.cos(a)}%, ${-50 + 50 * Math.sin(a)}%)` }}
              aria-hidden
            >
              {s.name}
            </span>
          );
        })}
    </div>
  );
}

/** Used when WebGL is missing or its context is lost. */
function BlobSvg({ id }: { id: string }) {
  const u = (name: string) => `url(#${id}${name})`;
  return (
    <svg viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} className="size-full overflow-visible">
      <defs>
        <linearGradient id={`${id}gel`} data-gel x1="-.9" y1="-.25" x2=".9" y2=".3" gradientUnits="userSpaceOnUse">
          {['#ffcdb8', '#f494db', '#a066ff', '#546eff', '#40c2ff', '#6bf2d6'].map((c, i) => (
            <stop key={c} offset={i / 5} stopColor={c} />
          ))}
        </linearGradient>
        <radialGradient id={`${id}pearl`} cx="-.34" cy="-.46" r=".95" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}lamp`} x1="-.6" y1="-.75" x2=".35" y2=".45" gradientUnits="userSpaceOnUse">
          <stop offset=".1" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".46" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}pool`} x1=".6" y1=".75" x2="-.2" y2="-.3" gradientUnits="userSpaceOnUse">
          <stop offset=".1" stopColor="#c9f8ff" stopOpacity=".95" />
          <stop offset=".55" stopColor="#c9f8ff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation=".085" />
        </filter>
        <filter id={`${id}edge`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation=".02" />
        </filter>
        <filter id={`${id}swirl`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale=".5" xChannelSelector="R" yChannelSelector="G" result="bent" />
          <feGaussianBlur in="bent" stdDeviation=".035" />
        </filter>
        <clipPath id={`${id}clip`}>
          <path data-d />
        </clipPath>
      </defs>
      <path data-d fill={u('gel')} opacity=".5" filter={u('soft')} transform="translate(.03 .12)" />
      <g clipPath={u('clip')}>
        <rect x="-1.3" y="-1.3" width="2.6" height="2.6" fill={u('gel')} opacity=".94" filter={u('swirl')} />
        <path data-d fill={u('pearl')} />
        <path data-d fill="none" stroke={u('pool')} strokeWidth=".2" filter={u('soft')} />
        <path data-d fill="none" stroke={u('lamp')} strokeWidth=".05" filter={u('edge')} transform="translate(-.015 -.02) scale(.82)" />
      </g>
      <path data-d fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth=".014" />
    </svg>
  );
}

function svgPainter(host: HTMLElement) {
  return {
    resize() {},
    paint(j: Jelly, s: BlobScene) {
      const d = contourPath(j.r);
      host.querySelectorAll('[data-d]').forEach((p) => p.setAttribute('d', d));
      const turn = 7 * Math.sin(s.time * 0.31) + 12 * s.pointer[2] * s.pointer[0];
      host.querySelector('[data-gel]')?.setAttribute('gradientTransform', `rotate(${turn.toFixed(2)})`);
    },
    dispose() {},
  };
}
