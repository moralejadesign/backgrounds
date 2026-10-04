'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { effects } from '@/lib/effects'
import { vertexShader, defaultsOf } from '@/lib/effects/common'
import { formats } from '@/lib/formats'
import { FIT_VIEW, computeLayout, zoomAt, stepScale, clampPan } from '@/lib/viewport'
import { BlurPipeline } from '@/lib/blurPipeline'
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

// Dibuja el efecto en el buffer actual del renderer: directo, o pasando por el desenfoque
function draw(renderer, material, pipeline, { effect, params, view, format }) {
  const blur = (params.blur ?? 0) / 100
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  if (blur > 0) {
    pipeline.render(renderer, material, {
      view,
      outW: size.x,
      outH: size.y,
      aspect: format.w / format.h,
      blur,
      grain: effect.grainOf(params),
      grainRes: material.uniforms.uGrainRes.value,
      seed: params.seed ?? 0,
    })
  } else {
    material.uniforms.uView.value.copy(view)
    material.uniforms.uGrainOn.value = 1
    material.uniforms.uDitherPass.value = 1
    pipeline.pass(renderer, material, null)
  }
}

function exportPNG(material, ctx) {
  const { w, h } = ctx.format
  const canvas = new OffscreenCanvas(w, h)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)

  const mat = material.clone()
  const pipeline = new BlurPipeline()
  // Imagen completa, sin el recorte del zoom de vista
  draw(renderer, mat, pipeline, { ...ctx, view: new THREE.Vector4(0, 0, 1, 1) })

  canvas.convertToBlob({ type: 'image/png' }).then((blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `croma-${w}x${h}-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
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

  // Zoom de vista (solo para inspeccionar; no afecta al export)
  const [stage, setStage] = useState(null)
  const [view, setView] = useState(FIT_VIEW)
  const layout = stage ? computeLayout(stage, format, view) : null

  // Refs con el último estado para los manejadores de gestos
  const live = useRef({})
  live.current = { stage, format, layout }

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

  // Render bajo demanda: parámetros, formato, zoom de textura o vista
  useEffect(() => {
    const gl = glRef.current
    if (!gl || !layout || !gl.mesh.material) return
    const u = gl.mesh.material.uniforms
    u.uAspect.value = format.w / format.h
    u.uGrainRes.value.set(format.w, format.h)
    u.uZoom.value = textureZoom
    effect.apply(u, params)

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
    draw(gl.renderer, gl.mesh.material, gl.pipeline, { effect, params, view, format })
  })

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
          onExport={() => glRef.current?.mesh.material && exportPNG(glRef.current.mesh.material, { effect, params, format })}
          exportLabel={`${format.w}×${format.h}`}
        />
      </main>
    </div>
  )
}
