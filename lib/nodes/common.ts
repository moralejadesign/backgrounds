import * as THREE from 'three'
import type { Control, ControlGroup, NodeDef, Option, Params, ParamValue, Uniforms } from './types'

// Base compartida por todos los nodos del grafo.
// Cada nodo renderiza la imagen completa a una textura; sus entradas son las texturas
// de los nodos conectados. El espacio de imagen es p = (uv - 0.5) * (aspecto, 1).

export const DEG = Math.PI / 180

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const HEADER = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uAspect;       // ancho / alto del formato
uniform vec2  uGrainRes;     // tamaño de export en px: grano y dithering anclados a sus píxeles
uniform sampler2D uInput;
uniform sampler2D uInputB;
uniform float uHasInput;
uniform float uHasInputB;

const float TAU = 6.2831853;

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

vec2 toP(vec2 uv) { return (uv - 0.5) * vec2(uAspect, 1.0); }
vec2 toUv(vec2 p) { return p / vec2(uAspect, 1.0) + 0.5; }

vec3 inputAt(vec2 uv) { return uHasInput > 0.5 ? texture2D(uInput, uv).rgb : vec3(0.0); }
vec3 inputBAt(vec2 uv) { return uHasInputB > 0.5 ? texture2D(uInputB, uv).rgb : vec3(0.0); }

// Modos de fusión (b = base, t = capa encima)
vec3 blendMode(vec3 b, vec3 t, int m) {
  b = clamp(b, 0.0, 1.0);
  t = clamp(t, 0.0, 1.0);
  if (m == 1) return 1.0 - (1.0 - b) * (1.0 - t);                                       // trama
  if (m == 2) return b * t;                                                              // multiplicar
  if (m == 3) return mix(2.0 * b * t, 1.0 - 2.0 * (1.0 - b) * (1.0 - t), step(0.5, b));  // superponer
  if (m == 4) return min(b + t, 1.0);                                                    // sumar
  if (m == 5) return mix(2.0 * b * t + b * b * (1.0 - 2.0 * t),
                         sqrt(b) * (2.0 * t - 1.0) + 2.0 * b * (1.0 - t), step(0.5, t));  // luz suave
  if (m == 6) return abs(b - t);                                                         // diferencia
  if (m == 7) return max(b, t);                                                          // aclarar
  return t;                                                                              // normal
}
`

export const commonUniforms = (): Uniforms => ({
  uAspect: { value: 1 },
  uGrainRes: { value: new THREE.Vector2(1, 1) },
  uInput: { value: null },
  uInputB: { value: null },
  uHasInput: { value: 0 },
  uHasInputB: { value: 0 },
})

// Los inputs de color entregan hex sRGB; se pasan tal cual al shader
export function hexToVec3(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export const colorUniform = (n = 4) => ({ value: Array.from({ length: n }, () => new THREE.Vector3()) })

export function setColors(uniform: THREE.IUniform<THREE.Vector3[]>, hexes: string[]) {
  hexes.forEach((c, i) => uniform.value[i].copy(hexToVec3(c)))
}

export const defaultsOf = (def: NodeDef): Params =>
  Object.fromEntries(def.groups.flatMap((g) => g.controls.map((c) => [c.key, c.value])))

// --- Fusión ---
export const BLEND_MODES: Option[] = [
  ['normal', 'Normal'],
  ['screen', 'Trama'],
  ['multiply', 'Multiplicar'],
  ['overlay', 'Superponer'],
  ['add', 'Sumar'],
  ['softLight', 'Luz suave'],
  ['difference', 'Diferencia'],
  ['lighten', 'Aclarar'],
]
export const blendIndex = (mode: string) => Math.max(0, BLEND_MODES.findIndex(([v]) => v === mode))

// activeWhen: [clave, valor] — el control se atenúa cuando no aplica (p. ej. fusión solo en modo "Encima")
export const blendControls = ({
  blend = 'normal',
  opacity = 1,
  activeWhen,
}: { blend?: string; opacity?: number; activeWhen?: readonly [string, ParamValue] } = {}): Control[] => [
  { key: 'blend', label: 'fusión', type: 'select', value: blend, options: BLEND_MODES, activeWhen },
  { key: 'opacity', label: 'opacidad', value: opacity, min: 0, max: 1, step: 0.01 },
]

// --- Movimiento por nodo (la duración y los fps son globales, en el nodo de salida) ---
export const animationGroup = (motions: Option[]): ControlGroup => ({
  id: 'animation',
  title: 'Animación',
  controls: [
    { key: 'animOn', label: 'animar', type: 'toggle', value: false },
    { key: 'animMotion', label: 'movimiento', type: 'select', value: motions[0][0], options: motions, dependsOn: 'animOn' },
    { key: 'animCycles', label: 'vueltas', value: 1, min: 1, max: 4, step: 1, dependsOn: 'animOn' },
  ],
})

// Movimientos que empalman en t = 1: vueltas completas o vaivenes senoidales
export const TAU = Math.PI * 2
export const turn = (base: number, t: number, cycles: number, full = 360) => base + full * cycles * t
export const breathe = (base: number, t: number, cycles: number, amplitude: number) => base + amplitude * Math.sin(TAU * cycles * t)
