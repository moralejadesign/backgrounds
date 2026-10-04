import * as THREE from 'three'
import { HEADER, blendControls, blendIndex, TAU } from './common'
import { ditherGroup, ditherGLSL, ditherUniforms, applyDither } from './ditherLayer'

// ---------------------------------------------------------------------------
// Dithering
// ---------------------------------------------------------------------------

const ditherControls = ditherGroup()
  .controls.filter((c) => c.key !== 'ditherOn')
  .map(({ dependsOn, ...c }) => c)

export const dither = {
  type: 'dither',
  title: 'Dithering',
  category: 'filter',
  description: 'Tramado Bayer, ruido o semitono',
  inputs: ['in'],
  groups: [{ id: 'dither', title: 'Dithering', controls: ditherControls }],
  fragment: /* glsl */ `
${HEADER}
${ditherGLSL}
void main() {
  gl_FragColor = vec4(ditherApply(inputAt(vUv), vUv), 1.0);
}
`,
  uniforms: () => ditherUniforms(),
  apply(u, p) {
    applyDither(u, { ...p, ditherOn: true })
    u.uDitherPass.value = 1
  },
}

// ---------------------------------------------------------------------------
// Desenfoque gaussiano: dos pasadas (horizontal y vertical) sobre la textura de entrada
// ---------------------------------------------------------------------------

const BLUR_TAPS = 24

export const blur = {
  type: 'blur',
  title: 'Desenfoque',
  category: 'filter',
  description: 'Desenfoque gaussiano',
  inputs: ['in'],
  groups: [
    {
      id: 'blur',
      title: 'Desenfoque',
      controls: [{ key: 'radius', label: 'radio', value: 1.5, min: 0, max: 10, step: 0.05, unit: '%' }],
    },
  ],
  fragment: /* glsl */ `
${HEADER}
uniform vec2  uDir;     // un texel en la dirección de la pasada
uniform float uSigma;   // en texels
uniform float uStep;    // separación entre muestras (radios grandes con pocas muestras)

void main() {
  vec3 sum = inputAt(vUv);
  float wsum = 1.0;
  for (int i = 1; i <= ${BLUR_TAPS}; i++) {
    float x = float(i) * uStep;
    if (x > uSigma * 3.0) break;
    float w = exp(-x * x / (2.0 * uSigma * uSigma));
    sum += (inputAt(vUv + uDir * x) + inputAt(vUv - uDir * x)) * w;
    wsum += 2.0 * w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`,
  uniforms: () => ({
    uDir: { value: new THREE.Vector2() },
    uSigma: { value: 1 },
    uStep: { value: 1 },
  }),
  apply() {},
  // Render propio: entrada → (horizontal) → temporal → (vertical) → salida
  render(engine, entry, inputs, p) {
    const u = entry.material.uniforms
    const { width, height } = entry.rt
    const sigma = (p.radius / 100) * height
    u.uSigma.value = Math.max(sigma, 0.001)
    u.uStep.value = Math.max(1, (sigma * 3) / BLUR_TAPS)
    if (!inputs[0] || sigma < 0.3) {
      u.uSigma.value = 0.001
      engine.pass(entry.material, entry.rt)
      return
    }
    const tmp = engine.tempTarget(entry, width, height)
    u.uDir.value.set(1 / width, 0)
    engine.pass(entry.material, tmp)
    u.uInput.value = tmp.texture
    u.uDir.value.set(0, 1 / height)
    engine.pass(entry.material, entry.rt)
  },
}

// ---------------------------------------------------------------------------
// Grano y viñeta (con aberración de lente)
// ---------------------------------------------------------------------------

export const grain = {
  type: 'grain',
  title: 'Grano y viñeta',
  category: 'filter',
  description: 'Grano de película, viñeta y aberración',
  inputs: ['in'],
  groups: [
    {
      id: 'grain',
      title: 'Grano',
      controls: [
        { key: 'amount', label: 'grano', value: 0.08, min: 0, max: 0.5, step: 0.005 },
        { key: 'size', label: 'tamaño', value: 1, min: 1, max: 6, step: 0.5 },
        { key: 'chroma', label: 'color', value: 0, min: 0, max: 1, step: 0.01 },
        { key: 'animated', label: 'animado', type: 'toggle', value: false },
        { key: 'vignette', label: 'viñeta', value: 0.35, min: 0, max: 1, step: 0.01 },
        { key: 'aberration', label: 'aberración', value: 0, min: 0, max: 1, step: 0.01 },
        { key: 'seed', label: 'semilla', value: 1, min: 0, max: 100, step: 1 },
      ],
    },
  ],
  fragment: /* glsl */ `
${HEADER}
uniform float uAmount;
uniform float uSize;
uniform float uChroma;
uniform float uVignette;
uniform float uAberration;
uniform float uSeed;

void main() {
  // Aberración de lente: los canales se separan hacia los bordes
  vec2 c = vUv - 0.5;
  float r = length(c * vec2(uAspect, 1.0));
  float k = uAberration * 0.025 * r;
  vec3 col = vec3(inputAt(0.5 + c * (1.0 + k)).r, inputAt(vUv).g, inputAt(0.5 + c * (1.0 - k)).b);

  float vd = r / (0.5 * length(vec2(uAspect, 1.0)));
  col *= 1.0 - uVignette * smoothstep(0.2, 1.0, vd);

  // Grano de película (distribución triangular), anclado a los píxeles del export
  vec2 cell = floor(vUv * uGrainRes / uSize) + uSeed * 31.7;
  float mono = hash(cell) + hash(cell + 0.37) - 1.0;
  vec3 chroma = vec3(hash(cell + 1.1), hash(cell + 2.2), hash(cell + 3.3)) * 2.0 - 1.0;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float w = mix(0.35, 1.0, smoothstep(0.0, 0.4, l)) * (1.0 - 0.4 * smoothstep(0.85, 1.0, l));
  col += mix(vec3(mono), chroma, uChroma) * uAmount * w;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms: () => ({
    uAmount: { value: 0 },
    uSize: { value: 1 },
    uChroma: { value: 0 },
    uVignette: { value: 0 },
    uAberration: { value: 0 },
    uSeed: { value: 0 },
  }),
  apply(u, p, { t }) {
    u.uAmount.value = p.amount
    u.uSize.value = p.size
    u.uChroma.value = p.chroma
    u.uVignette.value = p.vignette
    u.uAberration.value = p.aberration
    // Grano animado: un patrón distinto en cada instante del loop (como película real)
    u.uSeed.value = p.seed + (p.animated ? Math.floor(t * 997) * 1.618 : 0)
  },
}

// ---------------------------------------------------------------------------
// Animación: mueve la imagen de entrada en loop
// ---------------------------------------------------------------------------

const MOTIONS = ['drift', 'zoom', 'rotate', 'wave']

export const motion = {
  type: 'motion',
  title: 'Animación',
  category: 'motion',
  description: 'Deriva, zoom, rotación u onda en loop',
  inputs: ['in'],
  groups: [
    {
      id: 'motion',
      title: 'Movimiento',
      controls: [
        {
          key: 'motion',
          label: 'movimiento',
          type: 'select',
          value: 'drift',
          options: [
            ['drift', 'Deriva'],
            ['zoom', 'Zoom'],
            ['rotate', 'Rotación'],
            ['wave', 'Onda'],
          ],
        },
        { key: 'amount', label: 'intensidad', value: 0.5, min: 0, max: 1, step: 0.01 },
        { key: 'cycles', label: 'vueltas', value: 1, min: 1, max: 4, step: 1 },
        { key: 'frequency', label: 'frecuencia', value: 2, min: 0.5, max: 8, step: 0.1, activeWhen: ['motion', 'wave'] },
      ],
    },
  ],
  fragment: /* glsl */ `
${HEADER}
uniform int   uMotion;
uniform float uAmount;
uniform float uFrequency;
uniform float uAngle;   // 2π · vueltas · t: todos los movimientos empalman en t = 1

// Bordes en espejo: al mover la imagen no aparecen bandas vacías
vec2 mirrorUv(vec2 uv) { return 1.0 - abs(1.0 - mod(uv, 2.0)); }

void main() {
  vec2 p = toP(vUv);
  float a = uAngle;
  if (uMotion == 0) {
    p -= uAmount * 0.15 * vec2(sin(a), cos(a) - 1.0);
  } else if (uMotion == 1) {
    p /= 1.0 + uAmount * 0.35 * (0.5 - 0.5 * cos(a));
  } else if (uMotion == 2) {
    // Rotación completa con zoom para que las esquinas no se salgan del encuadre
    float cover = mix(1.0, length(vec2(uAspect, 1.0)) / min(uAspect, 1.0), uAmount);
    p = rot(a) * p / cover;
  } else {
    p.x += uAmount * 0.04 * sin(TAU * p.y * uFrequency + a);
    p.y += uAmount * 0.04 * sin(TAU * p.x * uFrequency + a);
  }
  gl_FragColor = vec4(inputAt(mirrorUv(toUv(p))), 1.0);
}
`,
  uniforms: () => ({
    uMotion: { value: 0 },
    uAmount: { value: 0 },
    uFrequency: { value: 2 },
    uAngle: { value: 0 },
  }),
  apply(u, p, { t }) {
    u.uMotion.value = Math.max(0, MOTIONS.indexOf(p.motion))
    u.uAmount.value = p.amount
    u.uFrequency.value = p.frequency
    u.uAngle.value = TAU * p.cycles * t
  },
}

// ---------------------------------------------------------------------------
// Mezcla: combina dos ramas con un modo de fusión
// ---------------------------------------------------------------------------

export const mix = {
  type: 'mix',
  title: 'Mezcla',
  category: 'combine',
  description: 'Combina dos ramas (A + B)',
  inputs: ['a', 'b'],
  groups: [{ id: 'mix', title: 'Mezcla', controls: blendControls({ blend: 'screen', opacity: 1 }) }],
  fragment: /* glsl */ `
${HEADER}
uniform int   uBlend;
uniform float uOpacity;
void main() {
  vec3 a = inputAt(vUv);
  vec3 b = uHasInputB > 0.5 ? inputBAt(vUv) : a;
  gl_FragColor = vec4(mix(a, blendMode(a, b, uBlend), uOpacity * uHasInputB), 1.0);
}
`,
  uniforms: () => ({ uBlend: { value: 1 }, uOpacity: { value: 1 } }),
  apply(u, p) {
    u.uBlend.value = blendIndex(p.blend)
    u.uOpacity.value = p.opacity
  },
}

// ---------------------------------------------------------------------------
// Salida: no tiene shader; muestra su entrada y guarda formato, duración y fps
// ---------------------------------------------------------------------------

export const output = {
  type: 'output',
  title: 'Output',
  category: 'output',
  inputs: ['in'],
  groups: [],
}
