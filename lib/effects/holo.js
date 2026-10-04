import * as THREE from 'three'
import { DEG, colorUniform, setColors } from './common'
import { glassGroup, glassGLSL, glassUniforms, applyGlass } from './glassLayer'
import { ditherGroup, ditherGLSL, ditherUniforms, applyDither } from './ditherLayer'

const DOF_SAMPLES = 16

const groups = [
  {
    id: 'shape',
    title: 'Forma',
    controls: [
      { key: 'size', label: 'tamaño', value: 0.63, min: 0.1, max: 1.5, step: 0.01 },
      { key: 'thickness', label: 'grosor', value: 0.02, min: 0.02, max: 0.6, step: 0.01 },
      { key: 'squareness', label: 'cuadratura', value: 0, min: 0, max: 1, step: 0.01 },
      { key: 'tilt', label: 'inclinación', value: 0.36, min: 0.1, max: 1, step: 0.01 },
      { key: 'rotation', label: 'rotación', value: -154, min: -180, max: 180, step: 1, unit: '°' },
      { key: 'bevel', label: 'bisel', value: 0.7, min: 0.05, max: 1, step: 0.01 },
      { key: 'positionX', label: 'posición x', value: 0, min: -1, max: 1, step: 0.01 },
      { key: 'positionY', label: 'posición y', value: 0.02, min: -1, max: 1, step: 0.01 },
    ],
  },
  glassGroup({ title: 'Vidrio', on: true }),
  {
    id: 'light',
    title: 'Luz',
    controls: [
      { key: 'lightAngle', label: 'dirección', value: 180, min: -180, max: 180, step: 1, unit: '°' },
      { key: 'rim', label: 'contraluz', value: 2.96, min: 0, max: 3, step: 0.01 },
      { key: 'rimPower', label: 'dureza borde', value: 6, min: 0.5, max: 8, step: 0.1 },
      { key: 'specular', label: 'brillo', value: 1.1, min: 0, max: 3, step: 0.01 },
      { key: 'inner', label: 'reflejo int.', value: 0.29, min: 0, max: 1.5, step: 0.01 },
      { key: 'frost', label: 'esmerilado', value: 0.93, min: 0, max: 1.5, step: 0.01 },
      { key: 'glow', label: 'resplandor', value: 1.5, min: 0, max: 1.5, step: 0.01 },
      { key: 'exposure', label: 'exposición', value: 2.18, min: 0.3, max: 3, step: 0.01 },
    ],
  },
  {
    id: 'spectrum',
    title: 'Espectro',
    controls: [
      { key: 'chroma', label: 'intensidad', value: 1, min: 0, max: 1, step: 0.01 },
      { key: 'dispersion', label: 'dispersión', value: 0.61, min: 0, max: 2, step: 0.01 },
      { key: 'hueShift', label: 'giro', value: 0, min: 0, max: 1, step: 0.01 },
      { key: 'color1', label: 'color 1', type: 'color', value: '#00e5ff' },
      { key: 'color2', label: 'color 2', type: 'color', value: '#ff2bd6' },
      { key: 'color3', label: 'color 3', type: 'color', value: '#3dff8a' },
      { key: 'color4', label: 'color 4', type: 'color', value: '#7a3cff' },
    ],
  },
  {
    id: 'focus',
    title: 'Enfoque',
    controls: [
      { key: 'focusY', label: 'plano foco', value: 0.01, min: -0.5, max: 0.5, step: 0.01 },
      { key: 'dof', label: 'prof. campo', value: 0.188, min: 0, max: 0.25, step: 0.001 },
    ],
  },
  ditherGroup(),
  {
    id: 'finish',
    title: 'Acabado',
    controls: [
      { key: 'grain', label: 'grano', value: 0, min: 0, max: 0.3, step: 0.005 },
      { key: 'blur', label: 'desenfoque', value: 0, min: 0, max: 10, step: 0.05, unit: '%' },
      { key: 'seed', label: 'semilla', value: 0, min: 0, max: 100, step: 1 },
    ],
  },
]

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uAspect;
uniform float uZoom;
uniform vec2  uGrainRes;
uniform float uGrainOn;

// --- Forma ---
uniform float uSize;
uniform float uThickness;
uniform float uSquareness;
uniform float uTilt;
uniform float uRotation;
uniform float uBevel;
uniform vec2  uCenter;

// --- Luz ---
uniform float uLightAngle;
uniform float uRim;
uniform float uRimPower;
uniform float uSpecular;
uniform float uInner;
uniform float uFrost;
uniform float uGlow;
uniform float uExposure;

// --- Espectro ---
uniform float uChroma;
uniform float uDispersion;
uniform float uHueShift;
uniform vec3  uColors[4];

// --- Enfoque ---
uniform float uFocusY;
uniform float uDof;

// --- Acabado ---
uniform float uGrain;
uniform float uSeed;

const float TAU = 6.2831853;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

${glassGLSL}
${ditherGLSL}

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

// Paleta espectral cíclica de 4 colores
vec3 spectral(float t) {
  float x = fract(t) * 4.0;
  float f = smoothstep(0.0, 1.0, fract(x));
  if (x < 1.0) return mix(uColors[0], uColors[1], f);
  if (x < 2.0) return mix(uColors[1], uColors[2], f);
  if (x < 3.0) return mix(uColors[2], uColors[3], f);
  return mix(uColors[3], uColors[0], f);
}

// Distancia (aprox.) al anillo: superelipse inclinada en perspectiva. <0 dentro del vidrio
float ringDist(vec2 p) {
  vec2 q = rot(-uRotation) * (p - uCenter);
  q.y /= uTilt;
  float n = mix(2.0, 8.0, uSquareness);
  float r = pow(pow(abs(q.x), n) + pow(abs(q.y), n), 1.0 / n);
  return abs(r - uSize) - uThickness * 0.5;
}

vec3 shade(vec2 p) {
  // Distancia con signo normalizada por el gradiente (corrige inclinación y superelipse)
  float eps = 0.0015;
  float d = ringDist(p);
  vec2 g = vec2(ringDist(p + vec2(eps, 0.0)) - d, ringDist(p + vec2(0.0, eps)) - d) / eps;
  float gl = max(length(g), 1e-4);
  vec2 out2 = g / gl;           // hacia afuera del vidrio
  float e = -d / gl;            // distancia al borde, >0 dentro

  vec2 L2 = vec2(cos(uLightAngle), sin(uLightAngle));
  float facing = dot(out2, L2);
  // Bordes de frente a la luz brillan; los opuestos reciben un contraluz tenue
  float lit = mix(0.18, 1.0, smoothstep(-0.2, 1.0, facing));

  float hw = uThickness * 0.5;
  float b = max(hw * uBevel, 1e-3);
  vec3 col = vec3(0.0);

  if (e > 0.0) {
    // Bisel redondeado (cuarto de círculo): pendiente infinita en el borde, plano adentro
    float t = clamp(e / b, 0.0, 1.0);
    float k = 1.0 - t;
    float slope = t < 1.0 ? k / sqrt(max(1e-4, 1.0 - k * k)) : 0.0;
    vec3 n = normalize(vec3(out2 * slope, 1.0));

    // Contraluz: máximo en el borde y cae a lo ancho del bisel
    float rim = pow(k, uRimPower) * 2.2;
    vec3 L = normalize(vec3(L2 * 0.85, 0.5));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 70.0);

    // Dispersión espectral: el tono rota con la orientación del borde y con la curvatura
    // Bandas de color a través del bisel (más donde más curva) + franjas prismáticas por canal
    float curv = smoothstep(0.0, 0.6, k);
    // Un ciclo entero alrededor del anillo: sin salto donde atan da la vuelta
    float hue = atan(out2.y, out2.x) / TAU + k * uDispersion * 1.3 + uHueShift;
    float dh = 0.07 * uDispersion;
    vec3 prism = vec3(spectral(hue - dh).r, spectral(hue).g, spectral(hue + dh).b);
    vec3 tint = mix(vec3(1.0), prism * 1.6, uChroma * curv);
    vec3 tintSpec = mix(vec3(1.0), spectral(hue + 0.17), uChroma * 0.35);

    // Reflexión interna: una línea fina paralela al borde, dentro de la cara plana
    float refl = exp(-pow((e - b * 1.35) / (b * 0.12), 2.0)) * uInner;

    // Cara plana esmerilada / ahumada
    float frost = uFrost * (0.035 + 0.03 * noise(p * 55.0 + uSeed)) * (0.55 + 0.45 * (lit));

    col += rim * uRim * lit * tint;
    col += spec * uSpecular * lit * tintSpec;
    col += refl * lit * mix(vec3(1.0), spectral(hue + 0.33), uChroma);
    col += frost * vec3(0.85, 0.9, 1.0);
  } else {
    // Resplandor fuera del vidrio, teñido por el espectro
    float glow = exp(e / (hw * 0.9)) * uGlow * 0.35 * lit;
    float hue = atan(out2.y, out2.x) / TAU + uHueShift;
    col += glow * mix(vec3(1.0), spectral(hue), uChroma);
  }
  return col;
}

void main() {
  float glassShade, glassHl;
  vec2 p = glassWarp((vUv - 0.5) * vec2(uAspect, 1.0) / uZoom, glassShade, glassHl);

  // Profundidad de campo: el círculo de confusión crece al alejarse del plano de foco,
  // más rápido hacia abajo (las curvas inferiores se disuelven)
  float dy = p.y - uFocusY;
  float coc = uDof * (dy < 0.0 ? -dy : dy * 0.35) * 2.0;

  vec3 col;
  if (coc < 0.0006) {
    col = shade(p);
  } else {
    // Disco de muestras (ángulo áureo) rotado al azar por píxel: el escalonado
    // de pocas muestras se convierte en ruido fino que el grano disimula
    col = vec3(0.0);
    float jitter = hash(floor(vUv * uGrainRes * 2.0) + 7.3) * TAU;
    float jr = hash(floor(vUv * uGrainRes * 2.0) + 19.1);
    for (int i = 0; i < ${DOF_SAMPLES}; i++) {
      float fi = float(i);
      float r = coc * sqrt((fi + jr) / ${DOF_SAMPLES}.0);
      float a = fi * 2.39996 + jitter;
      col += shade(p + r * vec2(cos(a), sin(a)));
    }
    col /= ${DOF_SAMPLES}.0;
  }

  // Curva fílmica: las luces se saturan suave en vez de recortarse
  col = 1.0 - exp(-col * uExposure);
  col = glassApply(col, glassShade, glassHl);

  vec2 cell = floor(vUv * uGrainRes) + floor(uSeed) * 31.7;
  float g = hash(cell) + hash(cell + 0.37) - 1.0;
  col += g * uGrain * uGrainOn;

  col = ditherApply(col, vUv);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export const holo = {
  id: 'holo',
  name: 'Chroma holographic',
  preset: { format: 'wide', textureZoom: 0.78 },
  icon: 'sparkle',
  groups,
  fragmentShader,
  uniforms: () => ({
    ...glassUniforms(),
    ...ditherUniforms(),
    uSize: { value: 0.6 },
    uThickness: { value: 0.2 },
    uSquareness: { value: 0 },
    uTilt: { value: 1 },
    uRotation: { value: 0 },
    uBevel: { value: 0.5 },
    uCenter: { value: new THREE.Vector2() },
    uLightAngle: { value: 0 },
    uRim: { value: 1 },
    uRimPower: { value: 2 },
    uSpecular: { value: 1 },
    uInner: { value: 0 },
    uFrost: { value: 0 },
    uGlow: { value: 0 },
    uExposure: { value: 1 },
    uChroma: { value: 1 },
    uDispersion: { value: 0.5 },
    uHueShift: { value: 0 },
    uColors: colorUniform(),
    uFocusY: { value: 0 },
    uDof: { value: 0 },
    uGrain: { value: 0 },
    uSeed: { value: 0 },
  }),
  // Grano equivalente para la composición tras el desenfoque
  grainOf: (p) => ({ amount: p.grain, size: 1, weighted: 0 }),
  apply(u, p) {
    applyGlass(u, p)
    applyDither(u, p)
    u.uSize.value = p.size
    u.uThickness.value = p.thickness
    u.uSquareness.value = p.squareness
    u.uTilt.value = p.tilt
    u.uRotation.value = p.rotation * DEG
    u.uBevel.value = p.bevel
    u.uCenter.value.set(p.positionX, p.positionY)
    u.uLightAngle.value = p.lightAngle * DEG
    u.uRim.value = p.rim
    u.uRimPower.value = p.rimPower
    u.uSpecular.value = p.specular
    u.uInner.value = p.inner
    u.uFrost.value = p.frost
    u.uGlow.value = p.glow
    u.uExposure.value = p.exposure
    u.uChroma.value = p.chroma
    u.uDispersion.value = p.dispersion
    u.uHueShift.value = p.hueShift
    setColors(u.uColors, [p.color1, p.color2, p.color3, p.color4])
    u.uFocusY.value = p.focusY
    u.uDof.value = p.dof
    u.uGrain.value = p.grain
    u.uSeed.value = p.seed
  },
}
