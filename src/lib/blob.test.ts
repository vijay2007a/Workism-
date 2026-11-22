import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJelly, harmonics, radiusAt, restContour, scoreRadius, skillAngle, NODES } from './blob.ts';

const SCORES = [85, 70, 65, 45, 30];
const nodeAt = (theta: number) => ((Math.round((theta / (2 * Math.PI)) * NODES) % NODES) + NODES) % NODES;
const run = (j: ReturnType<typeof createJelly>, seconds: number, each?: () => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) { j.step(1 / 60); each?.(); }
};
// Inverse of the score→radius mapping, taken from its two endpoints so the test does not reuse the formula.
const impliedScore = (r: number) => ((r - scoreRadius(0)) / (scoreRadius(100) - scoreRadius(0))) * 100;

test('score maps to a larger radius, linearly, and never leaves the reference circle', () => {
  assert.ok(scoreRadius(0) > 0.2);
  assert.ok(scoreRadius(100) < 1);
  assert.ok(Math.abs(scoreRadius(50) - (scoreRadius(0) + scoreRadius(100)) / 2) < 1e-9);
});

test('out-of-range and missing scores are clamped', () => {
  assert.equal(scoreRadius(150), scoreRadius(100));
  assert.equal(scoreRadius(-20), scoreRadius(0));
  assert.equal(scoreRadius(Number.NaN), scoreRadius(0));
});

test('the first skill sits at twelve o’clock and the rest run clockwise', () => {
  assert.ok(Math.abs(Math.cos(skillAngle(0, 5))) < 1e-9);
  assert.ok(Math.sin(skillAngle(0, 5)) < -0.99); // screen y points down
  assert.ok(Math.cos(skillAngle(1, 5)) > 0.9);
});

test('the resting contour passes through every skill’s data radius', () => {
  SCORES.forEach((s, i) => assert.ok(Math.abs(restContour(SCORES, skillAngle(i, 5)) - scoreRadius(s)) < 1e-6));
});

test('raising one score moves only that skill’s lobe', () => {
  const up = SCORES.with(3, 90);
  assert.ok(restContour(up, skillAngle(3, 5)) > restContour(SCORES, skillAngle(3, 5)) + 0.1);
  for (const i of [0, 1, 2, 4]) {
    assert.ok(Math.abs(restContour(up, skillAngle(i, 5)) - restContour(SCORES, skillAngle(i, 5))) < 1e-6);
  }
});

test('contour is finite for zero, one, two and many skills', () => {
  for (const scores of [[], [40], [40, 90], Array.from({ length: 12 }, (_, i) => i * 8)]) {
    for (let a = -7; a < 7; a += 0.05) assert.ok(Number.isFinite(restContour(scores, a)));
  }
});

test('idle motion is visible between lobes but never misreports a score', () => {
  const j = createJelly(SCORES);
  let liveliest = 0;
  run(j, 25, () => {
    SCORES.forEach((s, i) => assert.ok(Math.abs(impliedScore(j.r[nodeAt(skillAngle(i, 5))]) - s) < 2));
    const valley = skillAngle(0.5, 5);
    liveliest = Math.max(liveliest, Math.abs(j.r[nodeAt(valley)] - restContour(SCORES, valley)));
  });
  assert.ok(liveliest > 0.015, `valley only moved ${liveliest}`);
});

test('the nearest edge reaches for the cursor; the far side barely notices', () => {
  const j = createJelly(SCORES);
  const phi = skillAngle(0.5, 5);
  const rest = restContour(SCORES, phi);
  j.point((rest + 0.22) * Math.cos(phi), (rest + 0.22) * Math.sin(phi));
  run(j, 0.8);
  const near = j.u[nodeAt(phi)];
  const far = j.u[nodeAt(phi + Math.PI)];
  assert.ok(near > 0.05, `near edge moved ${near}`);
  assert.ok(Math.abs(far) < near * 0.35, `far edge moved ${far}`);
});

test('a distant cursor does not disturb it', () => {
  const j = createJelly(SCORES);
  j.point(4, 4);
  run(j, 1);
  assert.ok(Math.max(...j.u.map(Math.abs)) < 0.005);
});

test('it overshoots when the cursor leaves, then settles', () => {
  const j = createJelly(SCORES);
  const phi = skillAngle(0.5, 5);
  const rho = restContour(SCORES, phi) + 0.22;
  j.point(rho * Math.cos(phi), rho * Math.sin(phi));
  run(j, 1);
  const pulled = j.u[nodeAt(phi)];
  j.leave();
  let lowest = Infinity;
  run(j, 1, () => { lowest = Math.min(lowest, j.u[nodeAt(phi)]); });
  assert.ok(lowest < -0.04 * pulled, `lowest ${lowest} from ${pulled}`);
  assert.ok(lowest > -0.7 * pulled, 'overshoot should be slight');
  run(j, 2.5);
  assert.ok(Math.max(...j.u.map(Math.abs)) < 0.004);
});

test('a poke compresses it, ripples around the edge and dies out', () => {
  const j = createJelly(SCORES);
  j.poke(0.3, 0.1);
  let smallest = 0;
  run(j, 0.4, () => { smallest = Math.min(smallest, j.u.reduce((a, b) => a + b, 0) / NODES); });
  assert.ok(smallest < -0.02, `mean only dipped to ${smallest}`);
  run(j, 3.5);
  assert.ok(Math.max(...j.u.map(Math.abs)) < 0.004);
});

test('a poke is felt more strongly on the side that was poked', () => {
  const j = createJelly(SCORES);
  j.poke(0.6, 0);
  run(j, 0.08);
  assert.ok(Math.abs(j.u[nodeAt(0)]) > Math.abs(j.u[nodeAt(Math.PI)]) * 1.2);
});

test('violent input and stalled frames never blow it up', () => {
  const j = createJelly(SCORES);
  for (let i = 0; i < 1500; i++) {
    j.point(Math.sin(i * 12.9) * 1.6, Math.cos(i * 7.3) * 1.6);
    if (i % 5 === 0) j.poke(Math.sin(i), Math.cos(i));
    j.step(i % 97 === 0 ? 3 : 1 / 60);
    for (const r of j.r) assert.ok(Number.isFinite(r) && r > 0.1 && r < 1.3, `radius ${r} at ${i}`);
  }
});

test('changing scores glides instead of jumping', () => {
  const j = createJelly(SCORES);
  const before = j.r[nodeAt(skillAngle(4, 5))];
  j.setScores(SCORES.with(4, 95));
  j.step(1 / 60);
  assert.ok(Math.abs(j.r[nodeAt(skillAngle(4, 5))] - before) < 0.06);
  run(j, 4);
  assert.ok(Math.abs(impliedScore(j.r[nodeAt(skillAngle(4, 5))]) - 95) < 2);
});

test('the harmonics handed to the shader redraw the same contour', () => {
  const j = createJelly(SCORES);
  run(j, 1);
  const h = harmonics(j.r);
  for (let i = 0; i < NODES; i++) {
    const theta = (i / NODES) * 2 * Math.PI;
    assert.ok(Math.abs(radiusAt(h, theta) - j.r[i]) < 0.008);
  }
});
