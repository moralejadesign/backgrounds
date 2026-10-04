import * as THREE from 'three'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { BlurPipeline } from './blurPipeline'
import { animatedParams } from './animation'
import { draw } from './render'

// Export de video cuadro a cuadro: cada fotograma se renderiza al tamaño real en su instante
// exacto del loop y se codifica a H.264 con WebCodecs. No depende de la velocidad del equipo
// y el último cuadro empalma con el primero (t = i / frames, sin repetir t = 1).

export const canExportVideo = () => typeof window !== 'undefined' && 'VideoEncoder' in window

// Perfiles H.264 de mayor a menor calidad; nivel 5.1 cubre 1920×1080 y 1080×1920 a 60 fps
const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.420033']

async function pickConfig(w, h, fps) {
  const bitrate = Math.min(50e6, Math.round(w * h * fps * 0.3))
  for (const codec of CODECS) {
    const config = { codec, width: w, height: h, bitrate, framerate: fps }
    const { supported } = await VideoEncoder.isConfigSupported(config)
    if (supported) return config
  }
  throw new Error('Este navegador no puede codificar H.264')
}

export async function exportMP4({ material, effect, params, format, onProgress }) {
  const { w, h } = format
  const fps = Number(params.animFps) || 30
  const frames = Math.max(1, Math.round(params.animDuration * fps))
  const config = await pickConfig(w, h, fps)

  const canvas = new OffscreenCanvas(w, h)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  const mat = material.clone()
  const pipeline = new BlurPipeline()
  const view = new THREE.Vector4(0, 0, 1, 1)

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h, frameRate: fps },
    fastStart: 'in-memory',
  })
  let failure = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e),
  })
  encoder.configure(config)

  try {
    for (let i = 0; i < frames; i++) {
      if (failure) throw failure
      const p = animatedParams(effect, params, i / frames)
      effect.apply(mat.uniforms, p)
      draw(renderer, mat, pipeline, { effect, params: p, view, format })

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      })
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()

      // Contrapresión: no acumular cuadros sin codificar; y ceder al navegador para la UI
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 0))
      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0))
      onProgress?.((i + 1) / frames)
    }
    await encoder.flush()
    if (failure) throw failure
    muxer.finalize()
    return new Blob([muxer.target.buffer], { type: 'video/mp4' })
  } finally {
    if (encoder.state !== 'closed') encoder.close()
    mat.dispose()
    pipeline.dispose()
    renderer.dispose()
  }
}
