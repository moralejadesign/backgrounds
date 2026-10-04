'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { effects } from '@/lib/effects'
import { vertexShader, defaultsOf } from '@/lib/effects/common'
import { formats } from '@/lib/formats'
import { FIT_VIEW, computeLayout, zoomAt, stepScale, clampPan } from '@/lib/viewport'
import { BlurPipeline } from '@/lib/blurPipeline'
import { draw, downloadBlob } from '@/lib/render'
import { animatedParams, isAnimated } from '@/lib/animation'
import { exportMP4, canExportVideo } from '@/lib/videoExport'
import Navbar from './Navbar'
import ControlPanel from './ControlPanel'
import ZoomBar from './ZoomBar'

function createMaterial(effect) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: effect.fragmentShader,
    uniforms: {
      // Comunes a todos los efectos
      uView: { value: new THREE.Vector4(0, 0, 1, 1) },
      uAspect: { value: 1 },
      uZoom: { value: 1 },
      uGrainRes: { value: new THREE.Vector2(1, 1) },
      uGrainOn: { value: 1 },
      ...effect.uniforms(),
    },
  })
}

function exportPNG(material, { effect, params, format }) {
  const { w, h } = format
  const canvas = new OffscreenCanvas(w, h)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)

  const mat = material.clone()
  effect.apply(mat.uniforms, params)
  const pipeline = new BlurPipeline()
  // Imagen completa, sin el recorte del zoom de vista
  draw(renderer, mat, pipeline, { effect, params, format, view: new THREE.Vector4(0, 0, 1, 1) })

  canvas.convertToBlob({ type: 'image/png' }).then((blob) => {
    downloadBlob(blob, `croma-${w}x${h}-${Date.now()}.png`)
    mat.dispose()
    pipeline.dispose()
    renderer.dispose()
  })
}

function measureStage(el) {
  const cs = getComputedStyle(el)
  return {
    w: el.clientWidth,
    h: el.clientHeight,
    pad: {
      l: parseFloat(cs.paddingLeft),
      r: parseFloat(cs.paddingRight),
      t: parseFloat(cs.paddingTop),
      b: parseFloat(cs.paddingBottom),
    },
  }
}

// Radio de las esquinas del preview (solo en pantalla; el PNG exportado sale recto)
const PREVIEW_RADIUS = 14

const isTyping = (el) => el && (el.isContentEditable || /^(TEXTAREA|SELECT)$/.test(el.tagName) ||
  (el.tagName === 'INPUT' && !['range', 'color', 'button'].includes(el.type)))

export default function Studio() {
  const stageRef = useRef(null)
  const shadowRef = useRef(null)
  const glRef = useRef(null)

  const [effectId, setEffectId] = useState(effects[0].id)
  const effect = effects.find((e) => e.id === effectId)

  // Cada efecto conserva sus propios parámetros al cambiar de pestaña
  const [paramsByEffect, setParamsByEffect] = useState(() =>
    Object.fromEntries(effects.map((e) => [e.id, defaultsOf(e)])),
  )
  const params = paramsByEffect[effectId]
  const setParam = (key, value) =>
    setParamsByEffect((all) => ({ ...all, [effectId]: { ...all[effectId], [key]: value } }))
  // Restablecer: devuelve los controles de una sección a los valores originales del efecto
  const resetGroup = (group) =>
    setParamsByEffect((all) => ({
      ...all,
      [effectId]: { ...all[effectId], ...Object.fromEntries(group.controls.map((c) => [c.key, c.value])) },
    }))

  // Formato y zoom de textura (escala el patrón; afecta al export) también son por efecto,
  // con el valor inicial del preset de cada uno
  const [viewByEffect, setViewByEffect] = useState(() =>
    Object.fromEntries(
      effects.map((e) => [
        e.id,
        { formatId: e.preset?.format ?? formats[0].id, textureZoom: e.preset?.textureZoom ?? 1 },
      ]),
    ),
  )
  const { formatId, textureZoom } = viewByEffect[effectId]
  const format = formats.find((f) => f.id === formatId)
  const setEffectView = (patch) =>
    setViewByEffect((all) => ({ ...all, [effectId]: { ...all[effectId], ...patch } }))
  const setFormatId = (id) => setEffectView({ formatId: id })
  const setTextureZoom = (z) => setEffectView({ textureZoom: z })

  // Animación: el tiempo vive en un ref y el loop de reproducción dibuja sin pasar por React
  const animated = isAnimated(effect, params)
  const duration = params.animDuration ?? 6
  const timeRef = useRef(0)
  const progressRef = useRef(null)
  const timeLabelRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [videoProgress, setVideoProgress] = useState(null) // null = sin exportar; 0..1 = renderizando
  const loopT = () => (animated ? (timeRef.current % duration) / duration : 0)

  // Zoom de vista (solo para inspeccionar; no afecta al export)
  const [stage, setStage] = useState(null)
  const [view, setView] = useState(FIT_VIEW)
  const layout = stage ? computeLayout(stage, format, view) : null

  // Refs con el último estado para los manejadores de gestos
  const live = useRef({})
  const renderRef = useRef(() => {})
  live.current = { stage, format, layout, animated, duration, togglePlay: () => setPlaying((v) => !v) }

  useEffect(() => setView(FIT_VIEW), [formatId])

  // Setup único de three
  useEffect(() => {
    const stageEl = stageRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.className = 'stageCanvas'
    stageEl.appendChild(renderer.domElement)

    const pipeline = new BlurPipeline()
    // Contenedor del material activo (el pipeline lo dibuja con su propio quad)
    const mesh = { material: null }

    const ro = new ResizeObserver(() => setStage(measureStage(stageEl)))
    ro.observe(stageEl)

    glRef.current = { renderer, mesh, pipeline }
    return () => {
      ro.disconnect()
      pipeline.dispose()
      renderer.dispose()
      stageEl.removeChild(renderer.domElement)
      glRef.current = null
    }
  }, [])

  // Material del efecto activo
  useEffect(() => {
    const gl = glRef.current
    if (!gl) return
    const material = createMaterial(effect)
    gl.mesh.material = material
    return () => material.dispose()
  }, [effect])

  // Render del preview en el instante actual del loop. Se reasigna en cada render de React
  // (con el estado vigente) y lo llaman tanto ese render como el loop de reproducción.
  renderRef.current = () => {
    const gl = glRef.current
    if (!gl || !layout || !gl.mesh.material) return
    const u = gl.mesh.material.uniforms
    const frameParams = animatedParams(effect, params, loopT())
    u.uAspect.value = format.w / format.h
    u.uGrainRes.value.set(format.w, format.h)
    u.uZoom.value = textureZoom
    effect.apply(u, frameParams)

    const { img, vis } = layout
    Object.assign(shadowRef.current.style, {
      left: `${img.left}px`, top: `${img.top}px`, width: `${img.w}px`, height: `${img.h}px`,
    })

    const canvas = gl.renderer.domElement
    if (vis.w < 1 || vis.h < 1) {
      canvas.style.display = 'none'
      return
    }
    // Solo se redondean las esquinas del lienzo que coinciden con esquinas reales de la imagen
    // (con zoom, la imagen puede salirse del escenario y el recorte no debe verse redondeado)
    const atL = vis.left - img.left < 1
    const atT = vis.top - img.top < 1
    const atR = img.left + img.w - (vis.left + vis.w) < 1
    const atB = img.top + img.h - (vis.top + vis.h) < 1
    const corner = (a, b) => (a && b ? `${PREVIEW_RADIUS}px` : '0')
    Object.assign(canvas.style, {
      display: 'block', left: `${vis.left}px`, top: `${vis.top}px`, width: `${vis.w}px`, height: `${vis.h}px`,
      borderRadius: `${corner(atT, atL)} ${corner(atT, atR)} ${corner(atB, atR)} ${corner(atB, atL)}`,
    })
    const size = gl.renderer.getSize(new THREE.Vector2())
    if (size.x !== vis.w || size.y !== vis.h) gl.renderer.setSize(vis.w, vis.h, false)

    // Recorte visible en UV de la imagen (v crece hacia arriba)
    const view = new THREE.Vector4(
      (vis.left - img.left) / img.w,
      1 - (vis.top + vis.h - img.top) / img.h,
      vis.w / img.w,
      vis.h / img.h,
    )
    draw(gl.renderer, gl.mesh.material, gl.pipeline, { effect, params: frameParams, view, format })
  }

  const syncTimeline = () => {
    if (progressRef.current) progressRef.current.value = String(loopT() * 1000)
    if (timeLabelRef.current) {
      timeLabelRef.current.textContent = `${(loopT() * duration).toFixed(1)} / ${duration.toFixed(1)} s`
    }
  }

  live.current.sync = syncTimeline

  // Render bajo demanda: parámetros, formato, zoom de textura o vista
  useEffect(() => {
    renderRef.current()
    syncTimeline()
  })

  // Al activar la animación empieza a reproducirse; al desactivarla vuelve al cuadro base
  useEffect(() => {
    setPlaying(animated)
    if (!animated) timeRef.current = 0
  }, [animated, effectId])

  // Loop de reproducción
  useEffect(() => {
    if (!playing) return
    let raf
    let last = performance.now()
    const tick = (now) => {
      timeRef.current = (timeRef.current + (now - last) / 1000) % live.current.duration
      last = now
      renderRef.current()
      live.current.sync()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const scrub = (fraction) => {
    timeRef.current = fraction * duration
    renderRef.current()
    syncTimeline()
  }

  const exportVideo = async () => {
    const material = glRef.current?.mesh.material
    if (!material || videoProgress !== null) return
    setPlaying(false)
    setVideoProgress(0)
    try {
      const blob = await exportMP4({ material, effect, params, format, onProgress: setVideoProgress })
      downloadBlob(blob, `croma-${effect.id}-${format.w}x${format.h}-${duration}s.mp4`)
    } catch (err) {
      console.error(err)
      alert(`No se pudo exportar el video: ${err.message}`)
    } finally {
      setVideoProgress(null)
    }
  }

  // Gestos: rueda/pinza para zoom, arrastre para paneo, doble clic, teclado
  useEffect(() => {
    const el = stageRef.current
    const point = (e) => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const zoomTo = (scale, x, y) => {
      const { stage, format, layout } = live.current
      if (!layout) return
      setView(zoomAt(stage, format, layout, scale, x, y))
    }
    const panBy = (dx, dy) => {
      const { stage, format, layout } = live.current
      if (!layout?.zoomed) return
      setView((v) => ({ zoom: v.zoom, ...clampPan(stage, format, layout.scale, v.panX + dx, v.panY + dy) }))
    }

    const onWheel = (e) => {
      const { layout } = live.current
      if (!layout) return
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/⌘ + rueda, o pinza del trackpad (llega como wheel con ctrlKey)
        e.preventDefault()
        const [x, y] = point(e)
        zoomTo(layout.scale * Math.exp(-e.deltaY * 0.01), x, y)
      } else if (layout.zoomed) {
        e.preventDefault()
        panBy(-e.deltaX, -e.deltaY)
      }
    }

    const pointers = new Map()
    let pinch = null
    const onDown = (e) => {
      if (e.target.closest('.zoomBar')) return
      pointers.set(e.pointerId, point(e))
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: live.current.layout?.scale }
      }
      if (live.current.layout?.zoomed || pointers.size === 2) {
        el.setPointerCapture(e.pointerId)
        el.classList.add('dragging')
      }
    }
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return
      const prev = pointers.get(e.pointerId)
      const cur = point(e)
      pointers.set(e.pointerId, cur)
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
        zoomTo(pinch.scale * (dist / pinch.dist), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
      } else if (pointers.size === 1) {
        panBy(cur[0] - prev[0], cur[1] - prev[1])
      }
    }
    const onUp = (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0) el.classList.remove('dragging')
    }
    const onDblClick = (e) => {
      if (e.target.closest('.zoomBar')) return
      const { layout } = live.current
      if (!layout) return
      if (layout.zoomed) return setView(FIT_VIEW)
      const [x, y] = point(e)
      zoomTo(layout.fit < 1 ? 1 : layout.fit * 2, x, y)
    }
    const onKey = (e) => {
      if (isTyping(e.target) || e.altKey) return
      const { stage, layout } = live.current
      if (!layout) return
      const cx = stage.w / 2
      const cy = stage.h / 2
      if (e.key === '+' || e.key === '=') zoomTo(stepScale(layout.scale, 1), cx, cy)
      else if (e.key === '-' || e.key === '_') zoomTo(stepScale(layout.scale, -1), cx, cy)
      else if (e.key === '0') setView(FIT_VIEW)
      else if (e.key === '1') zoomTo(1, cx, cy)
      else if (e.key === ' ' && live.current.animated && !/^(BUTTON|INPUT)$/.test(e.target.tagName)) live.current.togglePlay()
      else return
      e.preventDefault()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('dblclick', onDblClick)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const zoomFromCenter = (scale) => {
    if (!layout) return
    setView(zoomAt(stage, format, layout, scale, stage.w / 2, stage.h / 2))
  }

  return (
    <div className="app" style={{ '--ar': format.w / format.h }}>
      <Navbar effects={effects} effectId={effectId} onEffectChange={setEffectId} />
      <main className="layout">
        <div ref={stageRef} className={`stage ${layout?.zoomed ? 'zoomed' : ''}`}>
          <div ref={shadowRef} className="frameShadow" aria-hidden="true" />
          {layout && (
            <ZoomBar
              scale={layout.scale}
              fitted={view.zoom === null}
              onZoomIn={() => zoomFromCenter(stepScale(layout.scale, 1))}
              onZoomOut={() => zoomFromCenter(stepScale(layout.scale, -1))}
              onFit={() => setView(FIT_VIEW)}
              onActualSize={() => zoomFromCenter(1)}
              playback={
                animated && {
                  playing,
                  onToggle: () => setPlaying((v) => !v),
                  onScrub: scrub,
                  progressRef,
                  timeLabelRef,
                }
              }
            />
          )}
        </div>
        <ControlPanel
          groups={effect.groups}
          params={params}
          onChange={setParam}
          formats={formats}
          formatId={formatId}
          onFormatChange={setFormatId}
          textureZoom={textureZoom}
          onTextureZoomChange={setTextureZoom}
          onResetGroup={resetGroup}
          onExport={() =>
            glRef.current?.mesh.material &&
            exportPNG(glRef.current.mesh.material, { effect, params: animatedParams(effect, params, loopT()), format })
          }
          exportLabel={`${format.w}×${format.h}`}
          video={
            animated && {
              label: `${format.w}×${format.h} · ${duration} s`,
              progress: videoProgress,
              supported: canExportVideo(),
              onExport: exportVideo,
            }
          }
        />
      </main>
    </div>
  )
}
