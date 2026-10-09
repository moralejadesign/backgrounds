import * as THREE from 'three'
import { hexToVec3 } from './common'
import type { ControlGroup, Params, Uniforms } from './types'

// Capa de dithering compartida por los efectos (y por la composición tras el desenfoque).
// Cada efecto: añade ditherGroup() a sus grupos, inserta ditherGLSL en su shader y llama a
// ditherApply(col, uvImagen) justo antes de escribir el color. Requiere uGrainRes declarado.

const PATTERNS = ['bayer4', 'bayer8', 'noise', 'halftone']
const MODES = ['duotone', 'mono', 'color']

export const ditherGroup = (): ControlGroup => ({
  id: 'ditherLayer',
  title: 'Dithering',
  controls: [
    { key: 'ditherOn', label: 'activar', type: 'toggle', value: false },
    {
      key: 'ditherPattern',
      label: 'patrón',
      type: 'select',
      value: 'bayer8',
      dependsOn: 'ditherOn',
      options: [
        ['bayer4', 'Bayer 4×4'],
        ['bayer8', 'Bayer 8×8'],
        ['noise', 'Ruido'],
        ['halftone', 'Semitono'],
      ],
    },
    { key: 'ditherSize', label: 'tamaño', value: 2, min: 1, max: 12, step: 1, dependsOn: 'ditherOn' },
    { key: 'ditherLevels', label: 'niveles', value: 2, min: 2, max: 8, step: 1, dependsOn: 'ditherOn' },
    {
      key: 'ditherMode',
      label: 'color',
      type: 'select',
      value: 'duotone',
      dependsOn: 'ditherOn',
      options: [
        ['duotone', 'Dos tonos'],
        ['mono', 'Monocromo'],
        ['color', 'Color'],
      ],
    },
    { key: 'ditherDark', label: 'oscuro', type: 'color', value: '#0a0a0a', dependsOn: 'ditherOn' },
    { key: 'ditherLight', label: 'claro', type: 'color', value: '#f2efe9', dependsOn: 'ditherOn' },
    { key: 'ditherMix', label: 'mezcla', value: 1, min: 0, max: 1, step: 0.01, dependsOn: 'ditherOn' },
  ],
})

export const ditherGLSL = /* glsl */ `
// --- Dithering ---
uniform float uDitherOn;
uniform float uDitherPass;     // 0 cuando lo aplica la composición tras el desenfoque
uniform int   uDitherPattern;  // 0 bayer 4x4, 1 bayer 8x8, 2 ruido, 3 semitono
uniform int   uDitherMode;     // 0 dos tonos, 1 monocromo, 2 color
uniform float uDitherSize;     // en px de export
uniform float uDitherLevels;
uniform float uDitherMix;
uniform vec3  uDitherDark;
uniform vec3  uDitherLight;

// Matriz de Bayer recursiva (umbral ordenado en 0..1)
float ditherBayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float ditherBayer4(vec2 a) { return ditherBayer2(0.5 * a) * 0.25 + ditherBayer2(a); }
float ditherBayer8(vec2 a) { return ditherBayer4(0.5 * a) * 0.25 + ditherBayer2(a); }

float ditherHash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

vec3 ditherApply(vec3 col, vec2 imgUv) {
  if (uDitherOn * uDitherPass < 0.5) return col;

  // Rejilla anclada a los píxeles del export: el preview coincide con el PNG
  vec2 px = imgUv * uGrainRes / uDitherSize;
  float t;
  if (uDitherPattern == 0) t = ditherBayer4(px);
  else if (uDitherPattern == 1) t = ditherBayer8(px);
  else if (uDitherPattern == 2) t = ditherHash(floor(px));
  else t = clamp(length(fract(px / 4.0) - 0.5) * 1.414, 0.0, 1.0); // semitono: puntos que crecen
  t = clamp(t, 0.001, 0.999);

  float steps = uDitherLevels - 1.0;
  vec3 outCol;
  if (uDitherMode == 2) {
    outCol = floor(clamp(col, 0.0, 1.0) * steps + t) / steps;
  } else {
    float l = dot(clamp(col, 0.0, 1.0), vec3(0.299, 0.587, 0.114));
    float q = floor(l * steps + t) / steps;
    outCol = uDitherMode == 0 ? mix(uDitherDark, uDitherLight, q) : vec3(q);
  }
  return mix(col, outCol, uDitherMix);
}
`

export const ditherUniforms = (): Uniforms => ({
  uDitherOn: { value: 0 },
  uDitherPass: { value: 1 },
  uDitherPattern: { value: 1 },
  uDitherMode: { value: 0 },
  uDitherSize: { value: 2 },
  uDitherLevels: { value: 2 },
  uDitherMix: { value: 1 },
  uDitherDark: { value: new THREE.Vector3() },
  uDitherLight: { value: new THREE.Vector3(1, 1, 1) },
})

export function applyDither(u: Uniforms, p: Params) {
  u.uDitherOn.value = p.ditherOn ? 1 : 0
  u.uDitherPattern.value = PATTERNS.indexOf(p.ditherPattern)
  u.uDitherMode.value = MODES.indexOf(p.ditherMode)
  u.uDitherSize.value = p.ditherSize
  u.uDitherLevels.value = p.ditherLevels
  u.uDitherMix.value = p.ditherMix
  u.uDitherDark.value.copy(hexToVec3(p.ditherDark))
  u.uDitherLight.value.copy(hexToVec3(p.ditherLight))
}

// Copia los uniforms de dithering de un material a otro (efecto → composición)
export function copyDitherUniforms(from: Uniforms, to: Uniforms) {
  for (const key of Object.keys(ditherUniforms())) {
    const v = from[key].value
    if (v?.isVector3) to[key].value.copy(v)
    else to[key].value = v
  }
}
