import * as THREE from 'three'
import { HEADER, DEG, colorUniform, setColors, animationGroup, breathe, turn, TAU } from './common'
import type { NodeDef } from './types'

// ---------------------------------------------------------------------------
// Gradiente: luz elíptica (la base del antiguo efecto Glass), lineal o malla
// ---------------------------------------------------------------------------

const GRADIENT_TYPES = ['light', 'linear', 'mesh']

export const gradient: NodeDef = {
  type: 'gradient',
  title: 'Gradiente',
  category: 'source',
  description: 'Luz elíptica, lineal o malla',
  inputs: [],
  groups: [
    {
      id: 'gradient',
      title: 'Gradiente',
      controls: [
        {
          key: 'gradientType',
          label: 'tipo',
          type: 'select',
          value: 'light',
          options: [
            ['light', 'Luz elíptica'],
            ['linear', 'Lineal'],
            ['mesh', 'Malla'],
          ],
        },
        { key: 'colorCount', label: 'colores', value: 4, min: 2, max: 4, step: 1 },
        { key: 'color1', label: 'color 1', type: 'color', value: '#f6e9dc' },
        { key: 'color2', label: 'color 2', type: 'color', value: '#e3573c' },
        { key: 'color3', label: 'color 3', type: 'color', value: '#3b1b16' },
        { key: 'color4', label: 'color 4', type: 'color', value: '#050506' },
      ],
    },
    {
      id: 'shape',
      title: 'Forma',
      controls: [
        { key: 'positionX', label: 'posición x', value: 0.01, min: -1, max: 1, step: 0.01 },
        { key: 'positionY', label: 'posición y', value: -0.01, min: -1, max: 1, step: 0.01 },
        { key: 'scaleX', label: 'escala x', value: 0.99, min: 0.05, max: 2, step: 0.01 },
        { key: 'scaleY', label: 'escala y', value: 0.4, min: 0.05, max: 2, step: 0.01 },
        { key: 'rotation', label: 'rotación', value: -28, min: -180, max: 180, step: 1, unit: '°' },
        { key: 'falloff', label: 'caída', value: 1.1, min: 0.2, max: 3, step: 0.01 },
        { key: 'warp', label: 'distorsión', value: 0.4, min: 0, max: 2, step: 0.01 },
        { key: 'seed', label: 'semilla', value: 3, min: 0, max: 100, step: 1 },
      ],
    },
    animationGroup([
      ['orbit', 'Luz orbita'],
      ['breathe', 'Respira'],
      ['spin', 'Gira'],
      ['flow', 'Fluye (malla)'],
    ]),
  ],
  fragment: /* glsl */ `
${HEADER}
uniform int   uType;       // 0 luz elíptica, 1 lineal, 2 malla
uniform vec3  uColors[4];
uniform int   uColorCount;
uniform vec2  uCenter;
uniform vec2  uScale;
uniform float uRotation;
uniform float uFalloff;
uniform float uWarp;
uniform float uSeed;
uniform vec2  uFlow;       // desplazamiento circular en el espacio del ruido (loop de la malla)

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uColorCount - 1);
  vec3 c = uColors[0];
  for (int i = 0; i < 3; i++) {
    if (i < uColorCount - 1) c = mix(c, uColors[i + 1], smoothstep(0.0, 1.0, clamp(x - float(i), 0.0, 1.0)));
  }
  return c;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = toP(vUv);
  vec2 q = rot(-uRotation) * (p - uCenter);
  vec3 col;

  if (uType == 0) {
    col = ramp(pow(length(q / max(uScale, vec2(1e-3))), uFalloff));
  } else if (uType == 1) {
    float t = q.x / (max(uScale.x, 1e-3) * uAspect) + 0.5;
    col = ramp(pow(clamp(t, 0.0, 1.0), uFalloff));
  } else {
    // Malla: ruido con domain warping, cada color ocupa sus propias zonas
    vec2 m = q / max(uScale.x, 0.05) * 1.2 + uSeed * 7.31 + uFlow;
    vec2 w = vec2(fbm(m), fbm(m + vec2(5.2, 1.3)));
    vec2 r = vec2(fbm(m + uWarp * 4.0 * w + vec2(1.7, 9.2)), fbm(m + uWarp * 4.0 * w + vec2(8.3, 2.8)));
    float n1 = clamp((fbm(m + uWarp * 4.0 * r) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
    float n2 = clamp((fbm(m * 0.8 + uWarp * 3.0 * w + 3.1) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
    float n3 = clamp((fbm(m * 1.3 - uWarp * 2.0 * r + 7.7) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
    float s = 0.04 + 0.22 * clamp(uFalloff / 3.0, 0.0, 1.0);
    col = mix(uColors[0], uColors[1], smoothstep(0.4 - s, 0.4 + s, n1));
    if (uColorCount > 2) col = mix(col, uColors[2], smoothstep(0.55 - s, 0.55 + s, n2));
    if (uColorCount > 3) col = mix(col, uColors[3], smoothstep(0.68 - s, 0.68 + s, n3));
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
  uniforms: () => ({
    uType: { value: 0 },
    uColors: colorUniform(4),
    uColorCount: { value: 4 },
    uCenter: { value: new THREE.Vector2() },
    uScale: { value: new THREE.Vector2(1, 1) },
    uRotation: { value: 0 },
    uFalloff: { value: 1 },
    uWarp: { value: 0 },
    uSeed: { value: 0 },
    uFlow: { value: new THREE.Vector2() },
  }),
  animate(p, t, motion, cycles) {
    const a = TAU * cycles * t
    switch (motion) {
      case 'breathe':
        return { ...p, scaleX: breathe(p.scaleX, t, cycles, p.scaleX * 0.3), scaleY: breathe(p.scaleY, t, cycles, p.scaleY * 0.3) }
      case 'spin':
        return { ...p, rotation: turn(p.rotation, t, cycles) }
      case 'flow':
        return { ...p, flowX: 0.6 * (Math.cos(a) - 1), flowY: 0.6 * Math.sin(a) }
      default:
        return { ...p, positionX: p.positionX + 0.2 * Math.sin(a), positionY: p.positionY + 0.1 * (Math.cos(a) - 1) }
    }
  },
  apply(u, p) {
    u.uType.value = Math.max(0, GRADIENT_TYPES.indexOf(p.gradientType))
    setColors(u.uColors, [p.color1, p.color2, p.color3, p.color4])
    u.uColorCount.value = p.colorCount
    u.uCenter.value.set(p.positionX, p.positionY)
    u.uScale.value.set(p.scaleX, p.scaleY)
    u.uRotation.value = p.rotation * DEG
    u.uFalloff.value = p.falloff
    u.uWarp.value = p.warp
    u.uSeed.value = p.seed
    u.uFlow.value.set(p.flowX ?? 0, p.flowY ?? 0)
  },
}

// ---------------------------------------------------------------------------
// Imagen: archivo del usuario, encuadrado para cubrir el formato
// ---------------------------------------------------------------------------

export const image: NodeDef = {
  type: 'image',
  title: 'Imagen',
  category: 'source',
  description: 'Sube una foto o ilustración',
  inputs: [],
  hasFile: true,
  groups: [
    {
      id: 'frame',
      title: 'Encuadre',
      controls: [
        { key: 'zoom', label: 'zoom', value: 1, min: 1, max: 4, step: 0.01, unit: '×' },
        { key: 'offsetX', label: 'posición x', value: 0, min: -0.5, max: 0.5, step: 0.01 },
        { key: 'offsetY', label: 'posición y', value: 0, min: -0.5, max: 0.5, step: 0.01 },
      ],
    },
  ],
  fragment: /* glsl */ `
${HEADER}
uniform sampler2D uImage;
uniform float uHasImage;
uniform float uImageAspect;
uniform float uZoom;
uniform vec2  uOffset;

void main() {
  if (uHasImage < 0.5) {
    // Sin imagen: damero oscuro como marcador
    vec2 c = floor(vUv * uGrainRes / 24.0);
    float k = mod(c.x + c.y, 2.0);
    gl_FragColor = vec4(vec3(0.07 + 0.03 * k), 1.0);
    return;
  }
  // Encuadre "cover": la imagen llena el formato sin deformarse
  vec2 s = uAspect > uImageAspect ? vec2(1.0, uImageAspect / uAspect) : vec2(uAspect / uImageAspect, 1.0);
  vec2 uv = (vUv - 0.5) * s / uZoom + 0.5 - uOffset;
  gl_FragColor = vec4(texture2D(uImage, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}
`,
  uniforms: () => ({
    uImage: { value: null },
    uHasImage: { value: 0 },
    uImageAspect: { value: 1 },
    uZoom: { value: 1 },
    uOffset: { value: new THREE.Vector2() },
  }),
  apply(u, p, { engine, nodeId }) {
    const tex = engine.images.get(nodeId)
    u.uImage.value = tex ?? null
    u.uHasImage.value = tex ? 1 : 0
    u.uImageAspect.value = tex ? tex.image.width / tex.image.height : 1
    u.uZoom.value = p.zoom
    u.uOffset.value.set(p.offsetX, -p.offsetY)
  },
}
