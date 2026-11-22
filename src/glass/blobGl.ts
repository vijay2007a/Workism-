import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { HARMONICS, harmonics, type Jelly } from '../lib/blob';

export const VIEW = 1.3; // half-extent of the drawing, in reference-circle radii: leaves room for glow and shadow

const vertex = /* glsl */ `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }`;

const fragment = /* glsl */ `#version 300 es
precision highp float;
#define K ${HARMONICS}
uniform vec2 uRes;
uniform float uView, uTime, uA0;
uniform vec2 uC[K];
uniform vec3 uPtr;        // cursor position, presence 0..1
uniform vec3 uHot;        // direction of the highlighted skill, strength
uniform vec4 uRipple[3];  // position, age, strength
out vec4 outColor;

// Contour radius and its derivative in this direction, without atan.
vec2 contour(vec2 dir) {
  float r = uA0, d = 0.;
  vec2 z = dir;
  for (int k = 0; k < K; k++) {
    r += dot(uC[k], z);
    d += float(k + 1) * (uC[k].y * z.x - uC[k].x * z.y);
    z = vec2(z.x * dir.x - z.y * dir.y, z.x * dir.y + z.y * dir.x);
  }
  return vec2(max(r, .08), d);
}

const vec3 GEL[6] = vec3[6](
  vec3(1., .80, .70), vec3(.98, .58, .86), vec3(.64, .42, 1.),
  vec3(.36, .46, 1.), vec3(.24, .78, 1.), vec3(.38, .95, .80));

vec3 ramp(float s) {
  s = clamp(s, 0., 1.) * 5.;
  int i = int(min(floor(s), 4.));
  float f = s - float(i);
  return mix(GEL[i], GEL[i + 1], f * f * (3. - 2. * f));
}

// Where in the gel's colour field a point lies: slow swirls, nudged by the cursor.
float field(vec2 q) {
  float t = uTime;
  vec2 d = q - uPtr.xy;
  q += uPtr.z * .16 * d * exp(-dot(d, d) * 2.6);
  q += .105 * vec2(sin(q.y * 2.6 + t * .37) + .6 * sin(q.x * 3.7 - t * .29 + q.y * 1.3),
                   cos(q.x * 2.3 - t * .31) + .6 * sin(q.y * 4.1 + t * .23 - q.x));
  return .49 + .50 / uA0 * dot(q, vec2(.94, .24)) + .05 * sin(q.y * 4.2 + t * .43) + .03 * sin(t * .21);
}

float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}

void main() {
  vec2 p = (gl_FragCoord.xy / uRes * 2. - 1.) * uView;
  p.y = -p.y;
  float px = 2. * uView / uRes.y;
  float rho = length(p);
  vec2 dir = rho > 1e-4 ? p / rho : vec2(1., 0.);
  vec2 c = contour(dir);
  float slope = c.y / c.x;
  float sd = (rho - c.x) / sqrt(1. + slope * slope);

  // Coloured light and soft shadow the jelly throws onto the glass below it.
  float bob = .012 * sin(uTime * .9);
  vec2 ps = p - vec2(.035, .125 + bob);
  float rs = length(ps);
  vec2 cs = contour(ps / max(rs, 1e-4));
  float below = rs - cs.x * .97;
  float shadow = .46 * exp(-max(below + .03, 0.) * 8.) * smoothstep(-.5, .0, below + .42);
  vec3 thrown = mix(vec3(.33, .25, .74), ramp(field(ps)), .62);
  vec4 acc = vec4(thrown * shadow, shadow);
  float halo = .30 * exp(-max(sd, 0.) * 6.5);
  acc = acc * (1. - halo) + vec4(mix(ramp(field(p)), vec3(1.), .42) * halo, halo);

  if (sd < px) {
    // Thickness: a fat pillow, steep at the rim. Near the centre the lobes merge into one dome.
    float w = smoothstep(0., .66, rho / uA0);
    float re = mix(uA0, c.x, w);
    float t = min(rho / re, .9985);
    float h = sqrt(1. - pow(t, 2.6));
    vec2 tang = vec2(-dir.y, dir.x);
    vec2 grad = -.70 * pow(t, 1.6) / max(h, .07) * (dir - w * slope * tang) / re;

    // Living surface, then click ripples.
    grad += .085 * h * vec2(cos(p.x * 5.1 + uTime * .9 + 2. * sin(p.y * 3.2 - uTime * .5)),
                            sin(p.y * 5.7 - uTime * .8 + 2. * cos(p.x * 3.1 + uTime * .4)));
    float rip = 0.;
    for (int i = 0; i < 3; i++) {
      vec2 d = p - uRipple[i].xy;
      float l = length(d) + 1e-3;
      float front = l - uRipple[i].z * 1.25;
      float a = uRipple[i].w * exp(-uRipple[i].z * 2.4) * exp(-front * front * 26.);
      grad += d / l * a * cos(front * 24.) * 1.5;
      rip += a * (.5 + .5 * cos(front * 24.));
    }
    vec3 n = normalize(vec3(-grad, 1.));
    float tilt = length(n.xy);
    vec2 nd = n.xy / max(tilt, 1e-3);
    float fres = pow(1. - n.z, 1.9);

    // Refraction with a touch of dispersion: the rim bends the colours behind it.
    vec2 rp = p - n.xy * (.12 + .34 * h);
    float s = field(rp), spread = .035 + .05 * tilt;
    vec3 col = vec3(ramp(s - spread).r, ramp(s).g, ramp(s + spread).b);
    // A deeper second layer, bent further, gives the interior volume.
    vec3 deep = ramp(field(p * .82 - n.xy * .62 + vec2(.06, -.05)) + .05);
    col = mix(col, mix(col * deep * 1.35, deep, .6), .36 * h);

    // Veins of light folding through the gel.
    float fold = field(rp * 1.7 + vec2(.2, -.1)) * 9. + uTime * .25;
    col += pow(.5 + .5 * sin(fold), 10.) * .13 * h;

    // Trapped bubbles, near the middle where the surface is calm.
    for (int i = 0; i < 4; i++) {
      float f = float(i);
      vec2 b = uA0 * vec2(sin(f * 2.4 + uTime * .11 + .6), cos(f * 1.9 - uTime * .09 + 1.1)) * (.16 + .12 * f);
      vec2 d = (p - n.xy * .10 - b) / (.014 + .007 * mod(f * 1.7, 2.));
      float bd = length(d);
      float ring = smoothstep(1., .8, bd) * smoothstep(.3, .95, bd);
      col += ring * (.3 + .7 * max(dot(d / max(bd, .01), vec2(.6, .8)), 0.)) * .30;
      col += smoothstep(.36, .0, length(d + vec2(.36, .40))) * .42;
    }

    // Soft body shading from the key light, top-left.
    vec3 key = normalize(vec3(-.48 + .3 * uPtr.z * uPtr.x, -.64 + .3 * uPtr.z * uPtr.y, .72));
    float diff = max(dot(n, key), 0.);
    col *= .93 + .17 * diff;
    col = mix(col, vec3(1., .98, 1.), .16 * smoothstep(.55, 1., diff));
    // Light pools on the side facing away from the lamp, as it does in jelly.
    float pool = pow(max(dot(nd, vec2(.6, .8)), 0.), 2.4) * smoothstep(.28, .86, tilt) * smoothstep(1., .93, t);
    col += pool * (ramp(s + .16) * .42 + vec3(.20, .24, .26));
    // Saturated band just inside the rim: the eye reads it as thickness.
    float band = smoothstep(.70, .90, t) * smoothstep(1., .93, t);
    col *= 1. - .13 * band * (1. - .75 * max(dot(nd, vec2(.6, .8)), 0.));
    // Thin-film iridescence at grazing angles.
    vec3 film = .5 + .5 * cos(6.2832 * (fres * 1.15 + .3 * dot(dir, vec2(.8, .35)) + vec3(0., .33, .67)));
    col += film * fres * .22;

    float alpha = mix(.91, .66, pow(t, 3.));

    // Reflections of a studio: a soft window, its bounce, and a horizon sheen.
    vec2 q = n.xy / n.z;
    vec2 k = q - vec2(-.62 + .2 * uPtr.z * uPtr.x, -.78 + .2 * uPtr.z * uPtr.y);
    float ca = .82, sa = .57;
    vec2 kr = vec2(ca * k.x + sa * k.y, -sa * k.x + ca * k.y);
    float window = smoothstep(.10, -.05, box(kr, vec2(.20, .44), .14));
    float sheen = exp(-dot(kr, kr) * 2.2);
    vec2 bk = q - vec2(.95, 1.25);
    float bounce = exp(-dot(bk, bk) * 2.6);
    float spec = window * .74 + sheen * .20 + bounce * .30 + rip * .30;
    col = mix(col, vec3(1.), clamp(spec, 0., .96));
    alpha = max(alpha, clamp(spec, 0., 1.));

    // Rim: bright and thick toward the light, hairline elsewhere.
    float lean = .5 + .5 * dot(dir, vec2(-.6, -.8));
    float rim = smoothstep(-.050, -.004, sd) * fres;
    col = mix(col, vec3(1.), clamp(rim * (.34 + .42 * lean), 0., .9));
    float line = smoothstep(1.9 * px, .2 * px, abs(sd + 1.3 * px));
    col = mix(col, vec3(1.), line * (.55 + .4 * lean));
    alpha = max(alpha, line * .9);

    // Cursor glow and highlighted lobe.
    vec2 cd = p - uPtr.xy;
    col += uPtr.z * exp(-dot(cd, cd) * 7.) * vec3(.14, .11, .16);
    col += uHot.z * pow(max(dot(dir, uHot.xy), 0.), 14.) * smoothstep(.15, .85, t) * vec3(.22, .20, .24);

    float cover = smoothstep(px, -px, sd) * alpha;
    col = clamp(col, 0., 1.);
    acc = acc * (1. - cover) + vec4(col * cover, cover);
  }

  // Dither away banding; fade before the canvas edge.
  acc += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255. * step(.002, acc.a);
  outColor = acc * smoothstep(uView, uView * .86, max(abs(p.x), abs(p.y)));
}`;

export interface BlobScene {
  time: number;
  pointer: [x: number, y: number, presence: number];
  hot: [x: number, y: number, strength: number];
  ripples: { x: number; y: number; age: number; strength: number }[];
}

/** Throws when WebGL is unavailable; the caller falls back to SVG. */
export function createBlobGl(host: HTMLElement, maxDpr: number, onLost: () => void) {
  const canvas = document.createElement('canvas');
  // Probe first: OGL dereferences a null context instead of reporting it.
  if (!document.createElement('canvas').getContext('webgl2')) throw new Error('WebGL 2 unavailable');
  const renderer = new Renderer({ canvas, alpha: true, premultipliedAlpha: true, depth: false, dpr: Math.min(devicePixelRatio || 1, maxDpr) });
  const { gl } = renderer;
  gl.clearColor(0, 0, 0, 0);
  const uniforms = {
    uRes: { value: [1, 1] },
    uView: { value: VIEW },
    uTime: { value: 0 },
    uA0: { value: 0.7 },
    uC: { value: Array.from<number>({ length: HARMONICS * 2 }).fill(0) },
    uPtr: { value: [0, 0, 0] },
    uHot: { value: [1, 0, 0] },
    uRipple: { value: Array.from<number>({ length: 12 }).fill(0) },
  };
  const program = new Program(gl, { vertex, fragment, uniforms, depthTest: false, depthWrite: false });
  if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error('Blob shader failed to link');
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
  const h = new Float32Array(1 + HARMONICS * 2);

  canvas.style.cssText = 'display:block;width:100%;height:100%';
  canvas.addEventListener('webglcontextlost', onLost);
  host.append(canvas);

  return {
    resize() {
      const size = Math.max(1, host.clientWidth);
      renderer.setSize(size, size);
      canvas.style.width = canvas.style.height = '100%';
      uniforms.uRes.value = [canvas.width, canvas.height];
    },
    paint(jelly: Jelly, scene: BlobScene) {
      harmonics(jelly.r, h);
      uniforms.uA0.value = h[0];
      for (let i = 0; i < HARMONICS * 2; i++) uniforms.uC.value[i] = h[i + 1];
      uniforms.uTime.value = scene.time;
      uniforms.uPtr.value = scene.pointer;
      uniforms.uHot.value = scene.hot;
      for (let i = 0; i < 3; i++) {
        const r = scene.ripples[i];
        uniforms.uRipple.value.splice(i * 4, 4, r?.x ?? 0, r?.y ?? 0, r?.age ?? 9, r?.strength ?? 0);
      }
      renderer.render({ scene: mesh });
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
