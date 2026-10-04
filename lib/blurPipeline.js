import * as THREE from 'three'
import { ditherGLSL, ditherUniforms, copyDitherUniforms } from './effects/ditherLayer'

// Desenfoque gaussiano como post-proceso:
//   1. el efecto se renderiza (sin grano) a una textura, con margen alrededor para que
//      los bordes se desenfoquen con contenido real y no se oscurezcan;
//   2. blur separable horizontal + vertical;
//   3. composición final a pantalla, añadiendo el grano (y el dithering) encima para que queden nítidos.
// Con desenfoques grandes se trabaja a menor resolución: el resultado es idéntico
// (está desenfocado) y el costo se mantiene constante.

const MAX_TAPS = 16 // por lado; con sigma <= 4 texels alcanza para 3 sigma

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const blurFragment = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uDir;     // paso de un texel en la dirección del blur
uniform float uSigma;  // en texels
varying vec2 vUv;

void main() {
  vec3 sum = texture2D(tMap, vUv).rgb;
  float wsum = 1.0;
  for (int i = 1; i <= ${MAX_TAPS}; i++) {
    float x = float(i);
    if (x > uSigma * 3.0) break;
    float w = exp(-x * x / (2.0 * uSigma * uSigma));
    sum += (texture2D(tMap, vUv + uDir * x).rgb + texture2D(tMap, vUv - uDir * x).rgb) * w;
    wsum += 2.0 * w;
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}
`

const compositeFragment = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform vec4 uView;    // ventana visible en UV de la imagen
uniform vec4 uSrc;     // ventana (con margen) que cubre la textura desenfocada
uniform vec2 uGrainRes;
uniform float uGrain;
uniform float uGrainSize;
uniform float uGrainWeighted; // 1 = el grano se atenúa en negros (estilo película)
uniform float uSeed;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
${ditherGLSL}
void main() {
  vec2 img = uView.xy + vUv * uView.zw;
  vec3 col = texture2D(tMap, (img - uSrc.xy) / uSrc.zw).rgb;

  vec2 cell = floor(img * uGrainRes / uGrainSize) + floor(uSeed) * 31.7;
  float g = hash(cell) + hash(cell + 0.37) - 1.0;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float w = mix(1.0, mix(0.3, 1.0, smoothstep(0.0, 0.4, l)) * (1.0 - 0.4 * smoothstep(0.85, 1.0, l)), uGrainWeighted);
  col += g * uGrain * w;
  col = ditherApply(col, img);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export class BlurPipeline {
  constructor() {
    const rtOptions = {
      type: THREE.HalfFloatType, // evita bandas en degradados oscuros desenfocados
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    }
    this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOptions)
    this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOptions)

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: blurFragment,
      uniforms: { tMap: { value: null }, uDir: { value: new THREE.Vector2() }, uSigma: { value: 1 } },
    })
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        tMap: { value: null },
        uView: { value: new THREE.Vector4(0, 0, 1, 1) },
        uSrc: { value: new THREE.Vector4(0, 0, 1, 1) },
        uGrainRes: { value: new THREE.Vector2(1, 1) },
        uGrain: { value: 0 },
        uGrainSize: { value: 1 },
        uGrainWeighted: { value: 0 },
        uSeed: { value: 0 },
        ...ditherUniforms(),
      },
    })

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)
    this.camera = new THREE.Camera()
  }

  pass(renderer, material, target) {
    this.mesh.material = material
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)
  }

  /**
   * @param effectMat  material del efecto (se modifican uView y uGrainOn)
   * @param o.view     Vector4 ventana visible en UV de la imagen
   * @param o.outW/outH tamaño del buffer de salida en px
   * @param o.aspect   ancho / alto de la imagen
   * @param o.blur     sigma como fracción del alto de la imagen
   * @param o.grain    { amount, size, weighted }
   */
  render(renderer, effectMat, { view, outW, outH, aspect, blur, grain, grainRes, seed }) {
    // Sigma en UV (x abarca `aspect` altos) y margen de 3 sigma
    const su = blur / aspect
    const sv = blur
    const src = new THREE.Vector4(view.x - 3 * su, view.y - 3 * sv, view.z + 6 * su, view.w + 6 * sv)

    // Sigma en px de salida y factor de reducción
    const sigmaPx = blur * (outH / view.w)
    const down = Math.min(32, Math.max(1, sigmaPx / 4))
    const rtW = Math.max(1, Math.ceil((outW * (src.z / view.z)) / down))
    const rtH = Math.max(1, Math.ceil((outH * (src.w / view.w)) / down))
    this.rtA.setSize(rtW, rtH)
    this.rtB.setSize(rtW, rtH)

    // 1. Efecto sin grano
    effectMat.uniforms.uView.value.copy(src)
    effectMat.uniforms.uGrainOn.value = 0
    effectMat.uniforms.uDitherPass.value = 0 // el dithering va en la composición, tras el blur
    this.pass(renderer, effectMat, this.rtA)

    // 2. Blur separable
    const sigma = sigmaPx / down
    this.blurMat.uniforms.uSigma.value = sigma
    this.blurMat.uniforms.tMap.value = this.rtA.texture
    this.blurMat.uniforms.uDir.value.set(1 / rtW, 0)
    this.pass(renderer, this.blurMat, this.rtB)
    this.blurMat.uniforms.tMap.value = this.rtB.texture
    this.blurMat.uniforms.uDir.value.set(0, 1 / rtH)
    this.pass(renderer, this.blurMat, this.rtA)

    // 3. Composición + grano nítido
    const c = this.compMat.uniforms
    c.tMap.value = this.rtA.texture
    c.uView.value.copy(view)
    c.uSrc.value.copy(src)
    c.uGrainRes.value.copy(grainRes)
    c.uGrain.value = grain.amount
    c.uGrainSize.value = grain.size
    c.uGrainWeighted.value = grain.weighted
    c.uSeed.value = seed
    copyDitherUniforms(effectMat.uniforms, c)
    c.uDitherPass.value = 1
    this.pass(renderer, this.compMat, null)
  }

  dispose() {
    this.rtA.dispose()
    this.rtB.dispose()
    this.blurMat.dispose()
    this.compMat.dispose()
    this.mesh.geometry.dispose()
  }
}
