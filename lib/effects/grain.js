import * as THREE from 'three'
import { DEG, setColors } from './common'
import { glassGroup, glassGLSL, glassUniforms, applyGlass } from './glassLayer'
import { ditherGroup, ditherGLSL, ditherUniforms, applyDither } from './ditherLayer'
import { animationGroup, breathe, TAU } from '../animation'

const MAX_COLORS = 5

const groups = [
  animationGroup([
    ['sway', 'Tela ondula'],
    ['light', 'Luz barre'],
    ['slide', 'Vidrio se desliza'],
    ['drift', 'Tela flota'],
    ['swaySlide', 'Ondula y vidrio'],
  ]),
  {
    id: 'folds',
    title: 'Pliegues',
    controls: [
      { key: 'frequency', label: 'frecuencia', value: 1.1, min: 0.2, max: 4, step: 0.01 },
      { key: 'angle', label: 'ángulo', value: 30, min: -90, max: 90, step: 1, unit: '°' },
      { key: 'bend', label: 'curvatura', value: -0.7, min: -2, max: 2, step: 0.01 },
      { key: 'depth', label: 'profundidad', value: 1.8, min: 0, max: 3, step: 0.01 },
      { key: 'crease', label: 'arista', value: 0.8, min: 0, max: 1.5, step: 0.01 },
      { key: 'warp', label: 'distorsión', value: 0.35, min: 0, max: 2, step: 0.01 },
      { key: 'phase', label: 'desplazar', value: 0, min: -6.28, max: 6.28, step: 0.01 },
      { key: 'positionX', label: 'posición x', value: 0, min: -1, max: 1, step: 0.01 },
      { key: 'positionY', label: 'posición y', value: 0, min: -1, max: 1, step: 0.01 },
      { key: 'seed', label: 'semilla', value: 4, min: 0, max: 100, step: 1 },
    ],
  },
  glassGroup({ title: 'Vidrio', on: true }),
  {
    id: 'light',
    title: 'Luz',
    controls: [
      { key: 'lightAngle', label: 'dirección', value: 160, min: -180, max: 180, step: 1, unit: '°' },
      { key: 'lightHeight', label: 'altura', value: 0.15, min: 0.05, max: 1, step: 0.01 },
      { key: 'specular', label: 'brillo', value: 0.55, min: 0, max: 2, step: 0.01 },
      { key: 'gloss', label: 'dureza', value: 18, min: 2, max: 128, step: 1 },
      { key: 'exposure', label: 'exposición', value: 1.05, min: 0.3, max: 2, step: 0.01 },
      { key: 'contrast', label: 'contraste', value: 1.25, min: 0.5, max: 2.5, step: 0.01 },
    ],
  },
  {
    id: 'color',
    title: 'Color',
    controls: [
      { key: 'colorCount', label: 'colores', value: 2, min: 2, max: MAX_COLORS, step: 1 },
      // Sombras y luces son siempre los extremos; los tonos medios se intercalan en orden.
      // (el número de la key decide cuándo se atenúa en el panel)
      { key: 'color1', label: 'sombras', type: 'color', value: '#060606' },
      { key: 'color3', label: 'tono 1', type: 'color', value: '#5a4a3f' },
      { key: 'color4', label: 'tono 2', type: 'color', value: '#a8927c' },
      { key: 'color5', label: 'tono 3', type: 'color', value: '#d9cbbb' },
      { key: 'color2', label: 'luces', type: 'color', value: '#eeeeee' },
    ],
  },
  ditherGroup(),
  {
    id: 'finish',
    title: 'Acabado',
    controls: [
      { key: 'grain', label: 'grano', value: 0.13, min: 0, max: 0.5, step: 0.005 },
      { key: 'grainSize', label: 'tamaño grano', value: 1, min: 1, max: 4, step: 0.5 },
      { key: 'vignette', label: 'viñeta', value: 0.45, min: 0, max: 1, step: 0.01 },
      { key: 'blur', label: 'desenfoque', value: 0, min: 0, max: 10, step: 0.05, unit: '%' },
    ],
  },
]

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uAspect;
uniform float uZoom;      // zoom de textura (>1 acerca el patrón)
uniform vec2  uGrainRes;

// --- Pliegues ---
uniform float uFrequency;
uniform float uAngle;
uniform float uBend;
uniform float uDepth;
uniform float uCrease;
uniform float uWarp;
uniform float uPhase;
uniform vec2  uPosition;  // mueve la tela dentro del encuadre (la viñeta queda fija)
uniform float uSeed;

// --- Luz ---
uniform float uLightAngle;
uniform float uLightHeight;
uniform float uSpecular;
uniform float uGloss;
uniform float uExposure;
uniform float uContrast;

// --- Color ---
uniform vec3  uColors[${MAX_COLORS}];
uniform int   uColorCount;

// --- Acabado ---
uniform float uGrain;
uniform float uGrainOn;    // 0 cuando el grano lo añade el post-proceso de desenfoque
uniform float uGrainSize;
uniform float uVignette;


mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Altura de la tela: ondas suaves a lo largo de bandas curvas, más una arista afilada
float height(vec2 p) {
  vec2 q = rot(-uAngle) * p;
  q.x += uBend * q.y * q.y;                       // los pliegues se curvan

  vec2 s = q * 0.9 + uSeed * 3.17;                // ondulación orgánica de baja frecuencia
  q.x += uWarp * (noise(s) - 0.5);
  q.y += uWarp * 0.5 * (noise(s + 11.3) - 0.5);

  float k = uFrequency * 6.2832;                  // frecuencia = pliegues por alto de imagen
  float x = q.x * k + uPhase;
  float h = sin(x) * 0.6 + sin(x * 0.53 + q.y * 0.8 + uSeed) * 0.4;
  // Arista: un relieve bajo y estrecho que atrapa una línea fina de luz
  float sc = sin(x * 0.5 + 0.7 + uSeed * 0.37);
  h += uCrease * 0.35 * exp(-sc * sc / 0.012);

  // La amplitud escala con la longitud de onda: la pendiente no depende de la frecuencia
  return h / k;
}

${glassGLSL}
${ditherGLSL}

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uColorCount - 1);
  vec3 c = uColors[0];
  for (int i = 0; i < ${MAX_COLORS - 1}; i++) {
    if (i < uColorCount - 1) c = mix(c, uColors[i + 1], clamp(x - float(i), 0.0, 1.0));
  }
  return c;
}

void main() {
  float glassShade, glassHl;
  vec2 p = glassWarp((vUv - 0.5) * vec2(uAspect, 1.0) / uZoom - uPosition, glassShade, glassHl);

  // Normal por diferencias finitas
  float e = 0.0015;
  float h0 = height(p);
  float hx = (height(p + vec2(e, 0.0)) - h0) / e;
  float hy = (height(p + vec2(0.0, e)) - h0) / e;
  vec3 n = normalize(vec3(-hx * uDepth, -hy * uDepth, 1.0));

  // Luz direccional rasante: difusa + especular (Blinn-Phong) para el brillo satinado
  float el = uLightHeight * 1.5708;
  vec3 L = normalize(vec3(cos(uLightAngle) * cos(el), sin(uLightAngle) * cos(el), sin(el)));
  float diff = max(dot(n, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), uGloss) * uSpecular;

  // Los valles reciben menos luz: oclusión aproximada por la altura
  float ao = smoothstep(-1.2, 1.0, h0 * uFrequency * 6.2832);
  float lum = (diff * 1.15 + spec) * mix(1.0, ao, 0.55) * uExposure;

  // Viñeta
  float vd = length((vUv - 0.5) * vec2(uAspect, 1.0)) / (0.5 * length(vec2(uAspect, 1.0)));
  lum *= 1.0 - uVignette * smoothstep(0.15, 1.0, vd);

  lum = clamp((lum - 0.45) * uContrast + 0.45, 0.0, 1.0);

  // Sombras y brillos del vidrio, sobre la luminancia para quedar dentro de la paleta
  lum = clamp(lum * (1.0 - glassShade) + glassHl, 0.0, 1.0);

  // Grano fino de película: más presente en medios y luces, contenido en negros puros.
  // Se aplica sobre la luminancia, antes de la paleta, para que quede dentro de los colores.
  vec2 cell = floor(vUv * uGrainRes / uGrainSize) + floor(uSeed) * 31.7;
  float g = (hash(cell) + hash(cell + 0.37) + hash(cell + 0.71)) / 1.5 - 1.0;
  float w = mix(0.3, 1.0, smoothstep(0.0, 0.4, lum)) * (1.0 - 0.4 * smoothstep(0.85, 1.0, lum));
  lum = clamp(lum + g * uGrain * uGrainOn * w, 0.0, 1.0);

  gl_FragColor = vec4(ditherApply(ramp(lum), vUv), 1.0);
}
`

export const grain = {
  id: 'grain',
  name: 'Chrome ribbon',
  // Movimientos en loop. La tela usa vaivenes (sus ondas no tienen un período común),
  // el vidrio avanza un número entero de estrías
  animate(p, t, motion, cycles) {
    const a = TAU * cycles * t
    const sway = { phase: breathe(p.phase, t, cycles, 1.1) }
    const slide = { glassPhase: cycles * t }
    switch (motion) {
      case 'light':
        return { ...p, lightAngle: breathe(p.lightAngle, t, cycles, 35) }
      case 'slide':
        return { ...p, ...slide }
      case 'drift':
        return {
          ...p,
          positionX: p.positionX + 0.12 * Math.sin(a),
          positionY: p.positionY + 0.06 * (Math.cos(a) - 1),
        }
      case 'swaySlide':
        return { ...p, ...sway, ...slide }
      default:
        return { ...p, ...sway }
    }
  },
  icon: 'dots',
  groups,
  fragmentShader,
  uniforms: () => ({
    uFrequency: { value: 1 },
    uAngle: { value: 0 },
    uBend: { value: 0 },
    uDepth: { value: 1 },
    uCrease: { value: 0 },
    uWarp: { value: 0 },
    uPhase: { value: 0 },
    uPosition: { value: new THREE.Vector2() },
    uSeed: { value: 0 },
    uLightAngle: { value: 0 },
    uLightHeight: { value: 0.5 },
    uSpecular: { value: 0 },
    uGloss: { value: 16 },
    uExposure: { value: 1 },
    uContrast: { value: 1 },
    uColors: { value: Array.from({ length: MAX_COLORS }, () => new THREE.Vector3()) },
    uColorCount: { value: 2 },
    uGrain: { value: 0 },
    uGrainSize: { value: 1 },
    uVignette: { value: 0 },
    ...glassUniforms(),
    ...ditherUniforms(),
  }),
  // Grano equivalente para la composición tras el desenfoque
  grainOf: (p) => ({ amount: p.grain, size: p.grainSize, weighted: 1 }),
  apply(u, p) {
    u.uFrequency.value = p.frequency
    u.uAngle.value = p.angle * DEG
    u.uBend.value = p.bend
    u.uDepth.value = p.depth
    u.uCrease.value = p.crease
    u.uWarp.value = p.warp
    u.uPhase.value = p.phase
    u.uPosition.value.set(p.positionX, p.positionY)
    u.uSeed.value = p.seed
    u.uLightAngle.value = p.lightAngle * DEG
    u.uLightHeight.value = p.lightHeight
    u.uSpecular.value = p.specular
    u.uGloss.value = p.gloss
    u.uExposure.value = p.exposure
    u.uContrast.value = p.contrast
    const mids = [p.color3, p.color4, p.color5].slice(0, p.colorCount - 2)
    const palette = [p.color1, ...mids, p.color2]
    setColors(u.uColors, [...palette, ...Array(MAX_COLORS - palette.length).fill(p.color2)])
    u.uColorCount.value = palette.length
    u.uGrain.value = p.grain
    u.uGrainSize.value = p.grainSize
    u.uVignette.value = p.vignette
    applyGlass(u, p)
    applyDither(u, p)
  },
}
