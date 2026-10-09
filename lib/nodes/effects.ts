import * as THREE from 'three'
import {
  HEADER,
  DEG,
  colorUniform,
  setColors,
  blendControls,
  blendIndex,
  animationGroup,
  breathe,
  turn,
  TAU,
} from './common'
import { glassGroup, glassGLSL, glassUniforms, applyGlass } from './glassLayer'
import type { NodeDef, Option } from './types'

const MODE_OPTIONS: Option[] = [
  ['material', 'Usar imagen'],
  ['overlay', 'Encima'],
]

// ---------------------------------------------------------------------------
// Glass: vidrio acanalado que refracta la imagen de entrada
// ---------------------------------------------------------------------------

// Controles de la capa de vidrio compartida, sin el interruptor (el nodo se puede desactivar)
const glassControls = glassGroup({
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
})
  .controls.filter((c) => c.key !== 'glassOn')
  .map(({ dependsOn, ...c }) => c)

export const glass: NodeDef = {
  type: 'glass',
  title: 'Glass',
  category: 'effect',
  description: 'Vidrio acanalado que refracta la imagen',
  inputs: ['in'],
  groups: [
    { id: 'glass', title: 'Vidrio', controls: glassControls },
    {
      id: 'finish',
      title: 'Acabado',
      controls: [
        { key: 'aberration', label: 'aberración', value: 0.32, min: 0, max: 1, step: 0.01 },
        { key: 'mix', label: 'mezcla', value: 1, min: 0, max: 1, step: 0.01 },
      ],
    },
    animationGroup([
      ['slide', 'Vidrio se desliza'],
      ['sway', 'Vaivén'],
    ]),
  ],
  fragment: /* glsl */ `
${HEADER}
${glassGLSL}
uniform float uAberration;
uniform float uMix;

void main() {
  vec2 p = toP(vUv);
  // Aberración cromática: cada canal se refracta distinto dentro de la estría
  float shade, hl, s1, h1, s2, h2;
  vec2 pG = glassWarpK(p, 1.0, shade, hl);
  vec2 pR = glassWarpK(p, 1.0 + uAberration, s1, h1);
  vec2 pB = glassWarpK(p, 1.0 - uAberration, s2, h2);
  vec3 col = vec3(inputAt(toUv(pR)).r, inputAt(toUv(pG)).g, inputAt(toUv(pB)).b);
  col = glassApply(col, shade, hl);
  gl_FragColor = vec4(mix(inputAt(vUv), col, uMix), 1.0);
}
`,
  uniforms: () => ({ ...glassUniforms(), uAberration: { value: 0 }, uMix: { value: 1 } }),
  animate(p, t, motion, cycles) {
    if (motion === 'sway') return { ...p, glassShift: breathe(p.glassShift, t, cycles, 0.5) }
    return { ...p, glassPhase: cycles * t } // un número entero de estrías: la rejilla vuelve igual
  },
  apply(u, p) {
    applyGlass(u, { ...p, glassOn: true })
    u.uAberration.value = p.aberration
    u.uMix.value = p.mix
  },
}

// ---------------------------------------------------------------------------
// Chrome ribbon: tela satinada; refracta y sombrea la entrada, o se dibuja encima
// ---------------------------------------------------------------------------

const RIBBON_COLORS = 5

export const ribbon: NodeDef = {
  type: 'ribbon',
  title: 'Chrome ribbon',
  category: 'effect',
  description: 'Tela satinada con pliegues de luz',
  inputs: ['in'],
  groups: [
    {
      id: 'mode',
      title: 'Modo',
      controls: [
        { key: 'mode', label: 'modo', type: 'select', value: 'material', options: MODE_OPTIONS },
        ...blendControls({ blend: 'normal', opacity: 1, activeWhen: ['mode', 'overlay'] }),
        { key: 'refract', label: 'refracción', value: 0.05, min: 0, max: 0.3, step: 0.005, activeWhen: ['mode', 'material'] },
        { key: 'shading', label: 'sombreado', value: 1, min: 0, max: 1.5, step: 0.01, activeWhen: ['mode', 'material'] },
      ],
    },
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
        { key: 'colorCount', label: 'colores', value: 2, min: 2, max: RIBBON_COLORS, step: 1 },
        // Sombras y luces son los extremos; los tonos medios se intercalan (modo Encima)
        { key: 'color1', label: 'sombras', type: 'color', value: '#060606' },
        { key: 'color3', label: 'tono 1', type: 'color', value: '#5a4a3f' },
        { key: 'color4', label: 'tono 2', type: 'color', value: '#a8927c' },
        { key: 'color5', label: 'tono 3', type: 'color', value: '#d9cbbb' },
        { key: 'color2', label: 'luces', type: 'color', value: '#eeeeee' },
      ],
    },
    animationGroup([
      ['sway', 'Tela ondula'],
      ['light', 'Luz barre'],
      ['drift', 'Tela flota'],
    ]),
  ],
  fragment: /* glsl */ `
${HEADER}
uniform int   uMode;      // 0 usar imagen, 1 encima
uniform int   uBlend;
uniform float uOpacity;
uniform float uRefract;
uniform float uShading;

uniform float uFrequency;
uniform float uAngle;
uniform float uBend;
uniform float uDepth;
uniform float uCrease;
uniform float uWarp;
uniform float uPhase;
uniform vec2  uPosition;
uniform float uSeed;

uniform float uLightAngle;
uniform float uLightHeight;
uniform float uSpecular;
uniform float uGloss;
uniform float uExposure;
uniform float uContrast;

uniform vec3  uColors[${RIBBON_COLORS}];
uniform int   uColorCount;

// Altura de la tela: ondas suaves a lo largo de bandas curvas, más una arista estrecha
float height(vec2 p) {
  vec2 q = rot(-uAngle) * p;
  q.x += uBend * q.y * q.y;
  vec2 s = q * 0.9 + uSeed * 3.17;
  q.x += uWarp * (noise(s) - 0.5);
  q.y += uWarp * 0.5 * (noise(s + 11.3) - 0.5);
  float k = uFrequency * 6.2832;
  float x = q.x * k + uPhase;
  float h = sin(x) * 0.6 + sin(x * 0.53 + q.y * 0.8 + uSeed) * 0.4;
  float sc = sin(x * 0.5 + 0.7 + uSeed * 0.37);
  h += uCrease * 0.35 * exp(-sc * sc / 0.012);
  return h / k;
}

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uColorCount - 1);
  vec3 c = uColors[0];
  for (int i = 0; i < ${RIBBON_COLORS - 1}; i++) {
    if (i < uColorCount - 1) c = mix(c, uColors[i + 1], clamp(x - float(i), 0.0, 1.0));
  }
  return c;
}

void main() {
  vec2 p = toP(vUv) - uPosition;

  float e = 0.0015;
  float h0 = height(p);
  float hx = (height(p + vec2(e, 0.0)) - h0) / e;
  float hy = (height(p + vec2(0.0, e)) - h0) / e;
  vec3 n = normalize(vec3(-hx * uDepth, -hy * uDepth, 1.0));

  float el = uLightHeight * 1.5708;
  vec3 L = normalize(vec3(cos(uLightAngle) * cos(el), sin(uLightAngle) * cos(el), sin(el)));
  float diff = max(dot(n, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), uGloss) * uSpecular;
  float ao = mix(1.0, smoothstep(-1.2, 1.0, h0 * uFrequency * 6.2832), 0.55);

  vec3 base = inputAt(vUv);
  vec3 col;
  if (uMode == 0) {
    // La imagen de entrada es la tela: los pliegues la desplazan y la iluminan
    vec3 src = inputAt(vUv + n.xy * uRefract);
    float lit = max(((diff * 1.15) * ao * uExposure - 0.45) * uContrast + 0.45, 0.0);
    col = src * mix(1.0, lit * 1.25, uShading) + vec3(spec) * 0.85;
    col = mix(base, col, uOpacity);
  } else {
    float lum = clamp(((diff * 1.15 + spec) * ao * uExposure - 0.45) * uContrast + 0.45, 0.0, 1.0);
    col = mix(base, blendMode(base, ramp(lum), uBlend), uOpacity);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
  uniforms: () => ({
    uMode: { value: 0 },
    uBlend: { value: 0 },
    uOpacity: { value: 1 },
    uRefract: { value: 0 },
    uShading: { value: 1 },
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
    uColors: colorUniform(RIBBON_COLORS),
    uColorCount: { value: 2 },
  }),
  animate(p, t, motion, cycles) {
    const a = TAU * cycles * t
    if (motion === 'light') return { ...p, lightAngle: breathe(p.lightAngle, t, cycles, 35) }
    if (motion === 'drift') {
      return { ...p, positionX: p.positionX + 0.12 * Math.sin(a), positionY: p.positionY + 0.06 * (Math.cos(a) - 1) }
    }
    return { ...p, phase: breathe(p.phase, t, cycles, 1.1) } // sus ondas no tienen período común: vaivén
  },
  apply(u, p) {
    u.uMode.value = p.mode === 'overlay' ? 1 : 0
    u.uBlend.value = blendIndex(p.blend)
    u.uOpacity.value = p.opacity
    u.uRefract.value = p.refract
    u.uShading.value = p.shading
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
    setColors(u.uColors, [...palette, ...Array(RIBBON_COLORS - palette.length).fill(p.color2)])
    u.uColorCount.value = palette.length
  },
}

// ---------------------------------------------------------------------------
// Chroma holographic: anillo de vidrio con contraluz espectral y profundidad de campo
// ---------------------------------------------------------------------------

const DOF_SAMPLES = 16

export const holo: NodeDef = {
  type: 'holo',
  title: 'Chroma holographic',
  category: 'effect',
  description: 'Anillo de vidrio con luz espectral',
  inputs: ['in'],
  groups: [
    {
      id: 'mode',
      title: 'Modo',
      controls: [
        { key: 'mode', label: 'modo', type: 'select', value: 'overlay', options: MODE_OPTIONS },
        ...blendControls({ blend: 'screen', opacity: 1, activeWhen: ['mode', 'overlay'] }),
        { key: 'refract', label: 'refracción', value: 0.08, min: 0, max: 0.4, step: 0.005, activeWhen: ['mode', 'material'] },
      ],
    },
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
        { key: 'seed', label: 'semilla', value: 0, min: 0, max: 100, step: 1 },
      ],
    },
    animationGroup([
      ['lightSpectrum', 'Luz y espectro'],
      ['light', 'Luz recorre el borde'],
      ['spectrum', 'Espectro gira'],
      ['rotate', 'Anillo gira'],
      ['focus', 'Foco respira'],
    ]),
  ],
  fragment: /* glsl */ `
${HEADER}
uniform int   uMode;
uniform int   uBlend;
uniform float uOpacity;
uniform float uRefract;

uniform float uSize;
uniform float uThickness;
uniform float uSquareness;
uniform float uTilt;
uniform float uRotation;
uniform float uBevel;
uniform vec2  uCenter;

uniform float uLightAngle;
uniform float uRim;
uniform float uRimPower;
uniform float uSpecular;
uniform float uInner;
uniform float uFrost;
uniform float uGlow;
uniform float uExposure;

uniform float uChroma;
uniform float uDispersion;
uniform float uHueShift;
uniform vec3  uColors[4];

uniform float uFocusY;
uniform float uDof;
uniform float uSeed;

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

// Luz del anillo en p; refr = desplazamiento de la refracción (en UV), inside = 1 dentro del vidrio
vec3 ringLight(vec2 p, out vec2 refr, out float inside) {
  refr = vec2(0.0);
  inside = 0.0;
  float eps = 0.0015;
  float d = ringDist(p);
  vec2 g = vec2(ringDist(p + vec2(eps, 0.0)) - d, ringDist(p + vec2(0.0, eps)) - d) / eps;
  float gl = max(length(g), 1e-4);
  vec2 out2 = g / gl;
  float e = -d / gl;

  vec2 L2 = vec2(cos(uLightAngle), sin(uLightAngle));
  float lit = mix(0.18, 1.0, smoothstep(-0.2, 1.0, dot(out2, L2)));
  float hw = uThickness * 0.5;
  float b = max(hw * uBevel, 1e-3);
  vec3 col = vec3(0.0);

  if (e > 0.0) {
    inside = 1.0;
    float t = clamp(e / b, 0.0, 1.0);
    float k = 1.0 - t;
    float slope = t < 1.0 ? k / sqrt(max(1e-4, 1.0 - k * k)) : 0.0;
    vec3 n = normalize(vec3(out2 * slope, 1.0));
    refr = -n.xy * uRefract;

    float rim = pow(k, uRimPower) * 2.2;
    vec3 L = normalize(vec3(L2 * 0.85, 0.5));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 70.0);

    float curv = smoothstep(0.0, 0.6, k);
    float hue = atan(out2.y, out2.x) / TAU + k * uDispersion * 1.3 + uHueShift;
    float dh = 0.07 * uDispersion;
    vec3 prism = vec3(spectral(hue - dh).r, spectral(hue).g, spectral(hue + dh).b);
    vec3 tint = mix(vec3(1.0), prism * 1.6, uChroma * curv);
    vec3 tintSpec = mix(vec3(1.0), spectral(hue + 0.17), uChroma * 0.35);
    float refl = exp(-pow((e - b * 1.35) / (b * 0.12), 2.0)) * uInner;
    float frost = uFrost * (0.035 + 0.03 * noise(p * 55.0 + uSeed)) * (0.55 + 0.45 * lit);

    col += rim * uRim * lit * tint;
    col += spec * uSpecular * lit * tintSpec;
    col += refl * lit * mix(vec3(1.0), spectral(hue + 0.33), uChroma);
    col += frost * vec3(0.85, 0.9, 1.0);
  } else {
    float glow = exp(e / (hw * 0.9)) * uGlow * 0.35 * lit;
    float hue = atan(out2.y, out2.x) / TAU + uHueShift;
    col += glow * mix(vec3(1.0), spectral(hue), uChroma);
  }
  return col;
}

void main() {
  vec2 p = toP(vUv);

  // Profundidad de campo: el círculo de confusión crece al alejarse del plano de foco
  float dy = p.y - uFocusY;
  float coc = uDof * (dy < 0.0 ? -dy : dy * 0.35) * 2.0;
  int samples = coc < 0.0006 ? 1 : ${DOF_SAMPLES};
  float jitter = hash(floor(vUv * uGrainRes * 2.0) + 7.3) * TAU;
  float jr = hash(floor(vUv * uGrainRes * 2.0) + 19.1);

  vec3 light = vec3(0.0);
  vec3 seen = vec3(0.0);   // modo "usar imagen": la entrada vista a través del vidrio (y desenfocada)
  for (int i = 0; i < ${DOF_SAMPLES}; i++) {
    if (i >= samples) break;
    float fi = float(i);
    float r = samples == 1 ? 0.0 : coc * sqrt((fi + jr) / ${DOF_SAMPLES}.0);
    vec2 ps = p + r * vec2(cos(fi * 2.39996 + jitter), sin(fi * 2.39996 + jitter));
    vec2 refr;
    float inside;
    light += ringLight(ps, refr, inside);
    if (uMode == 0) seen += inputAt(toUv(ps) + refr) * (1.0 - inside * 0.25 * uFrost);
  }
  light /= float(samples);
  seen /= float(samples);
  light = 1.0 - exp(-light * uExposure);   // curva fílmica: las luces saturan suave

  vec3 base = inputAt(vUv);
  vec3 col = uMode == 0 ? seen + light : blendMode(base, light, uBlend);
  gl_FragColor = vec4(mix(base, col, uOpacity), 1.0);
}
`,
  uniforms: () => ({
    uMode: { value: 1 },
    uBlend: { value: 1 },
    uOpacity: { value: 1 },
    uRefract: { value: 0 },
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
    uColors: colorUniform(4),
    uFocusY: { value: 0 },
    uDof: { value: 0 },
    uSeed: { value: 0 },
  }),
  animate(p, t, motion, cycles) {
    switch (motion) {
      case 'light':
        return { ...p, lightAngle: turn(p.lightAngle, t, cycles) }
      case 'spectrum':
        return { ...p, hueShift: turn(p.hueShift, t, cycles, 1) }
      case 'rotate':
        return { ...p, rotation: turn(p.rotation, t, cycles) }
      case 'focus':
        return { ...p, focusY: breathe(p.focusY, t, cycles, 0.18) }
      default:
        return { ...p, lightAngle: turn(p.lightAngle, t, cycles), hueShift: turn(p.hueShift, t, cycles, 1) }
    }
  },
  apply(u, p) {
    u.uMode.value = p.mode === 'overlay' ? 1 : 0
    u.uBlend.value = blendIndex(p.blend)
    u.uOpacity.value = p.opacity
    u.uRefract.value = p.refract
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
    u.uSeed.value = p.seed
  },
}
