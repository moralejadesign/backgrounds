import * as THREE from 'three'
import { HEADER, hexToVec3 } from './common'

// ASCII: la imagen de entrada se convierte en una rejilla de caracteres. Cada celda toma
// la luminancia de su centro y elige el carácter de densidad equivalente en un atlas
// (los glifos dibujados una vez en una tira de canvas).

const CHARSETS = {
  standard: ' .:-=+*#%@',
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  binary: ' 10',
  dots: ' ·•●',
}

const GLYPH_W = 40 // proporción ~0,6 de una fuente monoespaciada
const GLYPH_H = 64

// Un atlas por juego de caracteres, compartido por el editor y el export
const atlases = new Map()
function atlasFor(set) {
  if (atlases.has(set)) return atlases.get(set)
  const chars = [...CHARSETS[set]]
  const canvas = document.createElement('canvas')
  canvas.width = GLYPH_W * chars.length
  canvas.height = GLYPH_H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 54px ui-monospace, "SF Mono", Menlo, Consolas, monospace'
  chars.forEach((c, i) => ctx.fillText(c, GLYPH_W * i + GLYPH_W / 2, GLYPH_H / 2 + 2))
  const texture = new THREE.CanvasTexture(canvas)
  // Sin mipmaps: el salto de coordenada entre celdas haría elegir un mipmap borroso
  // en esa columna de píxeles y aparecerían líneas verticales finas
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  const atlas = { texture, count: chars.length }
  atlases.set(set, atlas)
  return atlas
}

const COLOR_MODES = ['image', 'white', 'duotone']

export const ascii = {
  type: 'ascii',
  title: 'ASCII',
  category: 'effect',
  glyph: 'ascii',
  description: 'La imagen convertida en caracteres',
  inputs: ['in'],
  groups: [
    {
      id: 'chars',
      title: 'Caracteres',
      controls: [
        {
          key: 'charset',
          label: 'juego',
          type: 'select',
          value: 'standard',
          options: [
            ['standard', 'Estándar  .:-=+*#%@'],
            ['detailed', 'Detallado'],
            ['blocks', 'Bloques ░▒▓█'],
            ['binary', 'Binario 0 1'],
            ['dots', 'Puntos ·•●'],
          ],
        },
        { key: 'cell', label: 'tamaño', value: 12, min: 4, max: 48, step: 1, unit: 'px' },
        { key: 'ratio', label: 'ancho', value: 0.62, min: 0.4, max: 1, step: 0.01 },
        { key: 'contrast', label: 'contraste', value: 1.2, min: 0.5, max: 3, step: 0.01 },
        { key: 'invert', label: 'invertir', type: 'toggle', value: false },
      ],
    },
    {
      id: 'color',
      title: 'Color',
      controls: [
        {
          key: 'colorMode',
          label: 'color',
          type: 'select',
          value: 'image',
          options: [
            ['image', 'De la imagen'],
            ['white', 'Blanco'],
            ['duotone', 'Dos tonos'],
          ],
        },
        { key: 'textColor', label: 'texto', type: 'color', value: '#f2efe9', activeWhen: ['colorMode', 'duotone'] },
        { key: 'bgColor', label: 'fondo', type: 'color', value: '#0a0a0a' },
        { key: 'mix', label: 'mezcla', value: 1, min: 0, max: 1, step: 0.01 },
      ],
    },
  ],
  fragment: /* glsl */ `
${HEADER}
uniform sampler2D uAtlas;
uniform float uGlyphs;
uniform float uCell;       // alto de la celda en px de export
uniform float uRatio;      // ancho / alto de la celda
uniform float uContrast;
uniform float uInvert;
uniform int   uColorMode;  // 0 de la imagen, 1 blanco, 2 dos tonos
uniform vec3  uTextColor;
uniform vec3  uBgColor;
uniform float uMix;

void main() {
  // Rejilla anclada a los píxeles del export: el preview coincide con el PNG
  vec2 px = vUv * uGrainRes;
  vec2 size = vec2(uCell * uRatio, uCell);
  vec2 cell = floor(px / size);
  vec2 local = fract(px / size);

  vec3 src = inputAt((cell + 0.5) * size / uGrainRes);
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  l = clamp((l - 0.5) * uContrast + 0.5, 0.0, 1.0);
  if (uInvert > 0.5) l = 1.0 - l;

  // Carácter de densidad equivalente a la luminancia
  float idx = min(floor(l * uGlyphs), uGlyphs - 1.0);
  // Muestreo un poco hacia dentro del glifo: el filtrado no arrastra al carácter vecino del atlas
  vec2 g = mix(vec2(0.08, 0.04), vec2(0.92, 0.96), local);
  float glyph = texture2D(uAtlas, vec2((idx + g.x) / uGlyphs, g.y)).r;

  vec3 fg = uColorMode == 0 ? src / max(max(src.r, max(src.g, src.b)), 0.25) * 0.95
          : uColorMode == 1 ? vec3(1.0)
          : uTextColor;
  vec3 col = mix(uBgColor, fg, glyph);
  gl_FragColor = vec4(mix(inputAt(vUv), col, uMix), 1.0);
}
`,
  uniforms: () => ({
    uAtlas: { value: null },
    uGlyphs: { value: 10 },
    uCell: { value: 12 },
    uRatio: { value: 0.6 },
    uContrast: { value: 1 },
    uInvert: { value: 0 },
    uColorMode: { value: 0 },
    uTextColor: { value: new THREE.Vector3(1, 1, 1) },
    uBgColor: { value: new THREE.Vector3() },
    uMix: { value: 1 },
  }),
  apply(u, p) {
    const atlas = atlasFor(CHARSETS[p.charset] ? p.charset : 'standard')
    u.uAtlas.value = atlas.texture
    u.uGlyphs.value = atlas.count
    u.uCell.value = p.cell
    u.uRatio.value = p.ratio
    u.uContrast.value = p.contrast
    u.uInvert.value = p.invert ? 1 : 0
    u.uColorMode.value = Math.max(0, COLOR_MODES.indexOf(p.colorMode))
    u.uTextColor.value.copy(hexToVec3(p.textColor))
    u.uBgColor.value.copy(hexToVec3(p.bgColor))
    u.uMix.value = p.mix
  },
}
