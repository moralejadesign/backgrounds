import * as THREE from 'three'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { GraphEngine } from './engine'
import { formats } from '../formats'

// Export del grafo al tamaño real del formato: PNG del instante actual o MP4 del loop.
// El video se renderiza cuadro a cuadro (t = i / cuadros, sin repetir t = 1) y se codifica
// a H.264 con WebCodecs: no depende de la velocidad del equipo y el loop empalma perfecto.

export const canExportVideo = () => typeof window !== 'undefined' && 'VideoEncoder' in window

function setup(graph, images, preserve = false) {
  const format = formats.find((f) => f.id === graph.output.formatId) ?? formats[0]
  const { w, h } = format
  const canvas = new OffscreenCanvas(w, h)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: preserve })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  const engine = new GraphEngine(renderer, images)
  const outputId = graph.nodes.find((n) => n.type === 'output')?.id
  const renderFrame = (t) => {
    const results = engine.evaluate(graph, { width: w, height: h, res: { w, h }, t })
    engine.clear()
    engine.blit(results.get(outputId) ?? null, { x: 0, y: 0, w, h })
  }
  const dispose = () => {
    engine.dispose()
    renderer.dispose()
  }
  return { canvas, w, h, renderFrame, dispose }
}

export async function exportPNG(graph, images, t) {
  const { canvas, w, h, renderFrame, dispose } = setup(graph, images)
  try {
    renderFrame(t)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { blob, name: `croma-${w}x${h}-${Date.now()}.png` }
  } finally {
    dispose()
  }
}

// Perfiles H.264 de mayor a menor calidad; nivel 5.1 cubre 1920×1080 y 1080×1920 a 60 fps
const CODECS = ['avc1.640033', 'avc1.4d0033', 'avc1.420033']

export async function exportMP4(graph, images, { onProgress } = {}) {
  const fps = Number(graph.output.fps) || 30
  const duration = graph.output.duration
  const frames = Math.max(1, Math.round(duration * fps))
  const { canvas, w, h, renderFrame, dispose } = setup(graph, images, true)

  let config = null
  const bitrate = Math.min(50e6, Math.round(w * h * fps * 0.3))
  for (const codec of CODECS) {
    const c = { codec, width: w, height: h, bitrate, framerate: fps }
    if ((await VideoEncoder.isConfigSupported(c)).supported) {
      config = c
      break
    }
  }
  if (!config) {
    dispose()
    throw new Error('Este navegador no puede codificar H.264')
  }

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
      renderFrame(i / frames)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) })
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()
      // Contrapresión y respiro para la interfaz
      while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 0))
      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0))
      onProgress?.((i + 1) / frames)
    }
    await encoder.flush()
    if (failure) throw failure
    muxer.finalize()
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), name: `croma-${w}x${h}-${duration}s.mp4` }
  } finally {
    if (encoder.state !== 'closed') encoder.close()
    dispose()
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
