// Jelly physics for the living Skill Profile. Pure maths, no DOM: both renderers (WebGL and SVG) draw the same contour.
// Units: the reference circle has radius 1. Angles are screen-space (y down), so they run clockwise.

export const NODES = 120;
export const HARMONICS = 24;

const R_MIN = 0.42;
const R_MAX = 0.94;
const VALLEY = 0.23; // how far the contour dips between two neighbouring skills
const TAU = Math.PI * 2;

// Spring constants: STIFF/DAMP pull each node home, TENSION/VISCOSITY couple neighbours so dents travel as ripples.
const STIFF = 92;
const DAMP = 5.4;
const TENSION = 2600;
const VISCOSITY = 32;
const DT = 1 / 240;

export const scoreRadius = (score: number) =>
  R_MIN + ((R_MAX - R_MIN) * Math.min(100, Math.max(0, Number.isFinite(score) ? score : 0))) / 100;

export const skillAngle = (index: number, count: number) => -Math.PI / 2 + (index / count) * TAU;

const wrap = (a: number) => a - TAU * Math.round(a / TAU);

/** Data contour: exactly scoreRadius at each skill's angle, dipping smoothly between neighbours. */
export function restContour(scores: readonly number[], theta: number) {
  const n = scores.length;
  if (n === 0) return (R_MIN + R_MAX) / 2;
  const pos = ((((theta + Math.PI / 2) / TAU) * n) % n + n) % n;
  const i = Math.floor(pos) % n;
  const t = pos - Math.floor(pos);
  const a = scoreRadius(scores[i]);
  const b = scoreRadius(scores[(i + 1) % n]);
  return (a + (b - a) * t * t * (3 - 2 * t)) * (1 - VALLEY * Math.sin(Math.PI * t) ** 2);
}

/** Fourier form of a contour: [mean, cos1, sin1, cos2, sin2, …]. Cheap for a shader to evaluate without atan. */
export function harmonics(r: ArrayLike<number>, out = new Float32Array(1 + HARMONICS * 2)) {
  out.fill(0);
  for (let i = 0; i < NODES; i++) {
    out[0] += r[i] / NODES;
    for (let k = 1; k <= HARMONICS; k++) {
      const a = (k * i * TAU) / NODES;
      out[k * 2 - 1] += (2 / NODES) * r[i] * Math.cos(a);
      out[k * 2] += (2 / NODES) * r[i] * Math.sin(a);
    }
  }
  return out;
}

export function radiusAt(h: ArrayLike<number>, theta: number) {
  let r = h[0];
  for (let k = 1; k <= HARMONICS; k++) r += h[k * 2 - 1] * Math.cos(k * theta) + h[k * 2] * Math.sin(k * theta);
  return r;
}

/** Closed Catmull-Rom path through the contour, for the SVG renderer. */
export function contourPath(r: ArrayLike<number>, step = 3) {
  const pts: [number, number][] = [];
  for (let i = 0; i < NODES; i += step) {
    const a = (i / NODES) * TAU;
    pts.push([r[i] * Math.cos(a), r[i] * Math.sin(a)]);
  }
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n];
  const f = (v: number) => v.toFixed(4);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function createJelly(initial: readonly number[]) {
  const theta = Array.from({ length: NODES }, (_, i) => (i / NODES) * TAU);
  const rest = new Float32Array(NODES);
  const pin = new Float32Array(NODES); // 0 at a skill's angle, ~1 between skills: keeps idle wobble off the data
  const u = new Float32Array(NODES); // displacement from rest
  const v = new Float32Array(NODES);
  const f = new Float32Array(NODES);
  const r = new Float32Array(NODES); // what gets drawn
  let time = 0;
  let spare = 0;
  let pointer: { rho: number; phi: number } | null = null;

  const shape = (scores: readonly number[]) => {
    for (let i = 0; i < NODES; i++) {
      rest[i] = restContour(scores, theta[i]);
      pin[i] = 1;
      for (let s = 0; s < scores.length; s++) {
        pin[i] *= 1 - Math.exp(-((wrap(theta[i] - skillAngle(s, scores.length)) / 0.3) ** 2));
      }
    }
  };

  // Incommensurate speeds so the idle motion never visibly loops.
  const idle = (a: number, t: number) =>
    0.02 * Math.sin(t * 0.9) +
    0.02 * Math.sin(2 * a + t * 0.73) +
    0.016 * Math.sin(3 * a - t * 1.13 + 1.7) +
    0.011 * Math.sin(5 * a + t * 1.61 + 0.4) +
    0.012 * Math.sin(a - t * 0.47 + 2.9);

  const draw = () => {
    for (let i = 0; i < NODES; i++) r[i] = Math.min(1.2, Math.max(0.16, rest[i] + u[i] + pin[i] * idle(theta[i], time)));
  };

  const substep = () => {
    let net = 0;
    for (let i = 0; i < NODES; i++) {
      f[i] = 0;
      if (pointer) {
        const here = rest[i] + u[i];
        const near = 1 - smooth(0.12, 0.8, Math.abs(pointer.rho - here));
        const facing = Math.exp(-((wrap(theta[i] - pointer.phi) / 0.42) ** 2));
        f[i] = 105 * near * facing * Math.min(0.26, Math.max(-0.2, pointer.rho - here));
        net += f[i];
      }
    }
    net = (net / NODES) * 0.6; // squash and stretch: pulling one side draws jelly from the rest
    for (let i = 0; i < NODES; i++) {
      const l = i === 0 ? NODES - 1 : i - 1;
      const n = i === NODES - 1 ? 0 : i + 1;
      f[i] += -net - STIFF * u[i] - DAMP * v[i] + TENSION * (u[l] + u[n] - 2 * u[i]) + VISCOSITY * (v[l] + v[n] - 2 * v[i]);
    }
    for (let i = 0; i < NODES; i++) {
      v[i] += f[i] * DT;
      u[i] = Math.min(0.4, Math.max(-0.4, u[i] + v[i] * DT));
    }
  };

  shape(initial);
  draw();

  return {
    r,
    u,
    /** Advance by a frame. Long stalls (hidden tab) are capped rather than replayed. */
    step(dt: number) {
      const frame = Math.min(dt, 0.05);
      time += frame;
      for (spare += frame; spare >= DT; spare -= DT) substep();
      draw();
    },
    point(x: number, y: number) {
      pointer = { rho: Math.min(1.5, Math.hypot(x, y)), phi: Math.atan2(y, x) };
    },
    leave() {
      pointer = null;
    },
    /** Click: the whole body compresses, hardest on the side that was pressed. */
    poke(x: number, y: number) {
      for (let i = 0; i < NODES; i++) {
        const here = rest[i] + u[i];
        const d = Math.hypot(here * Math.cos(theta[i]) - x, here * Math.sin(theta[i]) - y);
        v[i] = Math.max(-4, v[i] - 0.75 - 1.9 * Math.exp(-((d / 0.5) ** 2)));
      }
    },
    setScores(scores: readonly number[]) {
      const from = rest.slice();
      shape(scores);
      for (let i = 0; i < NODES; i++) u[i] = Math.min(0.4, Math.max(-0.4, u[i] + from[i] - rest[i]));
    },
  };
}

export type Jelly = ReturnType<typeof createJelly>;
