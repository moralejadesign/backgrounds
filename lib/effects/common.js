import * as THREE from 'three'

export const DEG = Math.PI / 180

// uView = ventana visible dentro de la imagen (x, y, ancho, alto en UV).
// El preview con zoom solo renderiza ese recorte; el export usa la imagen completa (0, 0, 1, 1).
export const vertexShader = /* glsl */ `
uniform vec4 uView;
varying vec2 vUv;
void main() {
  vUv = uView.xy + uv * uView.zw;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// Los inputs de color entregan hex sRGB; lo pasamos tal cual al shader (sin gestión de color de three)
export function hexToVec3(hex) {
  const n = parseInt(hex.slice(1, 7), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export const colorUniform = () => ({ value: [0, 1, 2, 3].map(() => new THREE.Vector3()) })

export function setColors(uniform, hexes) {
  hexes.forEach((c, i) => uniform.value[i].copy(hexToVec3(c)))
}

export const defaultsOf = (effect) =>
  Object.fromEntries(effect.groups.flatMap((g) => g.controls.map((c) => [c.key, c.value])))
