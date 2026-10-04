import * as THREE from 'three'
import { DEG, colorUniform, setColors } from './common'
import { glassGroup, glassGLSL, glassUniforms, applyGlass } from './glassLayer'
import { ditherGroup, ditherGLSL, ditherUniforms, applyDither } from './ditherLayer'

const groups = [
  {
    id: 'light',
    title: 'Base de luz',
    icon: 'sun',
    controls: [
      { key: 'positionX', label: 'posición x', value: 0.01, min: -1, max: 1, step: 0.01 },
      { key: 'positionY', label: 'posición y', value: -0.01, min: -1, max: 1, step: 0.01 },
      { key: 'scaleX', label: 'escala x', value: 0.99, min: 0.05, max: 2, step: 0.01 },
      { key: 'scaleY', label: 'escala y', value: 0.4, min: 0.05, max: 2, step: 0.01 },
      { key: 'rotation', label: 'rotación', value: -28, min: -180, max: 180, step: 1, unit: '°' },
      { key: 'falloff', label: 'caída', value: 1.1, min: 0.2, max: 3, step: 0.01 },
      { key: 'colorCount', label: 'colores', value: 4, min: 2, max: 4, step: 1 },
      { key: 'color1', label: 'color 1', type: 'color', value: '#f6e9dc' },
      { key: 'color2', label: 'color 2', type: 'color', value: '#e3573c' },
      { key: 'color3', label: 'color 3', type: 'color', value: '#3b1b16' },
      { key: 'color4', label: 'color 4', type: 'color', value: '#050506' },
    ],
  },
  // Un único vidrio, coherente con los demás efectos. Los valores por defecto reproducen
  // el acanalado original (perfil invertido con curvatura, irregularidad y escalonado).
  glassGroup({
    title: 'Vidrio',
    on: true,
    extras: true,
    defaults: {
      glassSize: 0.39,
      glassDistShape: 'prism',
      glassDistortion: -0.09,
      glassCurve: 1.4,
      glassIrregular: 0,
      glassSlide: 0.53,
      glassShift: 1,
      glassStretch: 0,
      glassShadows: 1,
      glassHighlights: 1,
    },
    hide: ['glassDistShape', 'glassDistortion', 'glassCurve'],
  }),
  ditherGroup(),
  {
    id: 'finish',
    title: 'Acabado',
    icon: 'sparkle',
    controls: [
      { key: 'aberration', label: 'aberración', value: 0.32, min: 0, max: 1, step: 0.01 },
      { key: 'grain', label: 'grano', value: 0.055, min: 0, max: 0.3, step: 0.005 },
      { key: 'vignette', label: 'viñeta', value: 0.66, min: 0, max: 1, step: 0.01 },
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

// --- Acabado (el vidrio viene de glassLayer) ---
uniform float uAberration;
uniform float uGrain;
uniform float uGrainOn;    // 0 cuando el grano lo añade el post-proceso de desenfoque
uniform float uVignette;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

${glassGLSL}
${ditherGLSL}

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

  // Vidrio acanalado; aberración cromática: cada canal se refracta distinto dentro de la estría
  float glassShade, glassHl, sR, hR, sB, hB;
  vec2 pG = glassWarpK(p, 1.0, glassShade, glassHl);
  vec2 pR = glassWarpK(p, 1.0 + uAberration, sR, hR);
  vec2 pB = glassWarpK(p, 1.0 - uAberration, sB, hB);

  vec3 col;
  col.r = baseLight(pR).r;
  col.g = baseLight(pG).g;
  col.b = baseLight(pB).b;

  col = glassApply(col, glassShade, glassHl);

  // Viñeta
  float vd = length((vUv - 0.5) * vec2(uAspect, 1.0)) / (0.5 * length(vec2(uAspect, 1.0)));
  col *= 1.0 - uVignette * smoothstep(0.2, 1.0, vd);

  // Grano (anclado a la resolución de export para que preview == PNG)
  float g = hash21(floor(vUv * uGrainRes)) - 0.5;
  col += g * uGrain * uGrainOn;

  col = ditherApply(col, vUv);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export const glass = {
  id: 'glass',
  name: 'Glass',
  icon: 'flutes',
  groups,
  fragmentShader,
  uniforms: () => ({
    ...glassUniforms(),
    ...ditherUniforms(),
    uCenter: { value: new THREE.Vector2() },
    uScale: { value: new THREE.Vector2(1, 1) },
    uRotation: { value: 0 },
    uColors: colorUniform(),
    uColorCount: { value: 4 },
    uFalloff: { value: 1 },
    uAberration: { value: 0 },
    uGrain: { value: 0 },
    uVignette: { value: 0 },
    uSeed: { value: 0 },
  }),
  // Grano equivalente para la composición tras el desenfoque
  grainOf: (p) => ({ amount: p.grain * 0.7, size: 1, weighted: 0 }),
  apply(u, p) {
    applyGlass(u, p)
    applyDither(u, p)
    u.uCenter.value.set(p.positionX, p.positionY)
    u.uScale.value.set(p.scaleX, p.scaleY)
    u.uRotation.value = p.rotation * DEG
    setColors(u.uColors, [p.color1, p.color2, p.color3, p.color4])
    u.uColorCount.value = p.colorCount
    u.uFalloff.value = p.falloff
    u.uAberration.value = p.aberration
    u.uGrain.value = p.grain
    u.uVignette.value = p.vignette
    u.uSeed.value = p.seed
  },
}
