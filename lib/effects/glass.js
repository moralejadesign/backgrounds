import * as THREE from 'three'
import { DEG, colorUniform, setColors } from './common'

const groups = [
  {
    id: 'light',
    title: 'Base de luz',
    icon: 'sun',
    controls: [
      { key: 'positionX', label: 'posición x', value: -0.25, min: -1, max: 1, step: 0.01 },
      { key: 'positionY', label: 'posición y', value: 0.05, min: -1, max: 1, step: 0.01 },
      { key: 'scaleX', label: 'escala x', value: 0.9, min: 0.05, max: 2, step: 0.01 },
      { key: 'scaleY', label: 'escala y', value: 0.38, min: 0.05, max: 2, step: 0.01 },
      { key: 'rotation', label: 'rotación', value: -28, min: -180, max: 180, step: 1, unit: '°' },
      { key: 'falloff', label: 'caída', value: 1.1, min: 0.2, max: 3, step: 0.01 },
      { key: 'colorCount', label: 'colores', value: 4, min: 2, max: 4, step: 1 },
      { key: 'color1', label: 'color 1', type: 'color', value: '#f6e9dc' },
      { key: 'color2', label: 'color 2', type: 'color', value: '#e3573c' },
      { key: 'color3', label: 'color 3', type: 'color', value: '#3b1b16' },
      { key: 'color4', label: 'color 4', type: 'color', value: '#050506' },
    ],
  },
  {
    id: 'glass',
    title: 'Vidrio acanalado',
    icon: 'flutes',
    controls: [
      { key: 'flutes', label: 'estrías', value: 42, min: 2, max: 160, step: 1 },
      { key: 'angle', label: 'ángulo', value: 0, min: -90, max: 90, step: 1, unit: '°' },
      { key: 'refraction', label: 'refracción', value: 0.18, min: -2, max: 2, step: 0.01 },
      { key: 'curvature', label: 'curvatura', value: 1.4, min: 0.2, max: 4, step: 0.01 },
      { key: 'irregularity', label: 'irregularidad', value: 0.15, min: 0, max: 1, step: 0.01 },
      { key: 'shift', label: 'desplazamiento', value: 0.3, min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'finish',
    title: 'Acabado',
    icon: 'sparkle',
    controls: [
      { key: 'aberration', label: 'aberración', value: 0.12, min: 0, max: 1, step: 0.01 },
      { key: 'grain', label: 'grano', value: 0.05, min: 0, max: 0.3, step: 0.005 },
      { key: 'vignette', label: 'viñeta', value: 0.35, min: 0, max: 1, step: 0.01 },
      { key: 'blur', label: 'desenfoque', value: 0, min: 0, max: 10, step: 0.05, unit: '%' },
      { key: 'seed', label: 'semilla', value: 1, min: 0, max: 100, step: 1 },
    ],
  },
]

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uAspect;     // ancho / alto del lienzo
uniform float uZoom;       // zoom de textura (>1 acerca el patrón)
uniform vec2  uGrainRes;   // resolución de referencia para el grano (tamaño de export)
uniform float uSeed;

// --- Capa 1: base de luz ---
uniform vec2  uCenter;     // en unidades de alto, origen en el centro
uniform vec2  uScale;
uniform float uRotation;
uniform vec3  uColors[4];
uniform int   uColorCount;
uniform float uFalloff;

// --- Capa 2: vidrio acanalado ---
uniform float uFlutes;
uniform float uAngle;
uniform float uRefraction;
uniform float uCurvature;
uniform float uIrregularity;
uniform float uShift;

// --- Capa 3: acabado ---
uniform float uAberration;
uniform float uGrain;
uniform float uGrainOn;    // 0 cuando el grano lo añade el post-proceso de desenfoque
uniform float uVignette;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float hash11(float n) {
  return fract(sin(n * 127.1 + uSeed * 13.7) * 43758.5453);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Rampa de hasta 4 colores: uColors[0] en el centro, el último afuera.
vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uColorCount - 1);
  vec3 c = uColors[0];
  for (int i = 0; i < 3; i++) {
    if (i < uColorCount - 1) {
      float k = smoothstep(0.0, 1.0, clamp(x - float(i), 0.0, 1.0));
      c = mix(c, uColors[i + 1], k);
    }
  }
  return c;
}

vec3 baseLight(vec2 p) {
  vec2 q = rot(-uRotation) * (p - uCenter);
  q /= max(uScale, vec2(1e-3));
  float d = length(q);
  return ramp(pow(d, uFalloff));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) / uZoom;

  // Espacio rotado: las estrías corren a lo largo de r.y
  vec2 r = rot(-uAngle) * p;
  float w = uAspect / uFlutes;            // ancho de cada estría
  float cell = r.x / w;
  float id = floor(cell);
  float f = fract(cell);                  // 0..1 dentro de la estría
  float t = f * 2.0 - 1.0;                // -1..1

  float h1 = hash11(id);
  float h2 = hash11(id + 71.3);
  float irr = uIrregularity;

  // Perfil curvo de lente cilíndrico
  float prof = sign(t) * pow(abs(t), uCurvature);
  float strength = uRefraction * (1.0 + irr * (h1 * 2.0 - 1.0));

  vec2 off;
  off.x = -prof * w * 0.5 * strength;
  off.y = (f - 0.5) * uShift * (1.0 + irr * (h2 * 2.0 - 1.0)) + irr * (h2 - 0.5) * 0.08;

  // Aberración cromática: cada canal se refracta distinto dentro de la estría
  vec2 caX = vec2(prof * w * 0.25 * uAberration, 0.0);
  vec2 offR = off * (1.0 + uAberration) + caX;
  vec2 offG = off;
  vec2 offB = off * (1.0 - uAberration) - caX;

  mat2 back = rot(uAngle);
  vec3 col;
  col.r = baseLight(back * (r + offR)).r;
  col.g = baseLight(back * (r + offG)).g;
  col.b = baseLight(back * (r + offB)).b;

  // Viñeta
  float vd = length((vUv - 0.5) * vec2(uAspect, 1.0)) / (0.5 * length(vec2(uAspect, 1.0)));
  col *= 1.0 - uVignette * smoothstep(0.2, 1.0, vd);

  // Grano (anclado a la resolución de export para que preview == PNG)
  float g = hash21(floor(vUv * uGrainRes)) - 0.5;
  col += g * uGrain * uGrainOn;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export const glass = {
  id: 'glass',
  name: 'Vidrio',
  icon: 'flutes',
  groups,
  fragmentShader,
  uniforms: () => ({
    uCenter: { value: new THREE.Vector2() },
    uScale: { value: new THREE.Vector2(1, 1) },
    uRotation: { value: 0 },
    uColors: colorUniform(),
    uColorCount: { value: 4 },
    uFalloff: { value: 1 },
    uFlutes: { value: 40 },
    uAngle: { value: 0 },
    uRefraction: { value: 0.5 },
    uCurvature: { value: 1 },
    uIrregularity: { value: 0 },
    uShift: { value: 0 },
    uAberration: { value: 0 },
    uGrain: { value: 0 },
    uVignette: { value: 0 },
    uSeed: { value: 0 },
  }),
  // Grano equivalente para la composición tras el desenfoque
  grainOf: (p) => ({ amount: p.grain * 0.7, size: 1, weighted: 0 }),
  apply(u, p) {
    u.uCenter.value.set(p.positionX, p.positionY)
    u.uScale.value.set(p.scaleX, p.scaleY)
    u.uRotation.value = p.rotation * DEG
    setColors(u.uColors, [p.color1, p.color2, p.color3, p.color4])
    u.uColorCount.value = p.colorCount
    u.uFalloff.value = p.falloff
    u.uFlutes.value = p.flutes
    u.uAngle.value = p.angle * DEG
    u.uRefraction.value = p.refraction
    u.uCurvature.value = p.curvature
    u.uIrregularity.value = p.irregularity
    u.uShift.value = p.shift
    u.uAberration.value = p.aberration
    u.uGrain.value = p.grain
    u.uVignette.value = p.vignette
    u.uSeed.value = p.seed
  },
}
