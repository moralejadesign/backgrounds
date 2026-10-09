'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
} from 'react'
import * as THREE from 'three'
import { NODE_TYPES } from '@/lib/nodes'
import { GraphEngine, wouldCycle } from '@/lib/nodes/engine'
import {
  initialGraph,
  loadGraph,
  saveGraph,
  createNode,
  nodeWidth,
  previewHeight,
  portPosition,
  graphFormat,
  HEADER_H,
} from '@/lib/nodes/graph'
import { exportPNG, exportMP4, canExportVideo, downloadBlob } from '@/lib/nodes/exporter'
import type { Format } from '@/lib/formats'
import type { Edge, Graph, GraphNode, ImageMap, InputTexture, OutputSettings, ParamValue, Point } from '@/lib/nodes/types'
import NodeCard from './NodeCard'
import OutputBody from './OutputBody'
import Library from './Library'
import Onboarding from './Onboarding'
import s from './Editor.module.css'

const WORK_MAX = 1280 // lado mayor de las texturas de trabajo del editor (el export va a tamaño real)
const ZOOM_MIN = 0.2
const ZOOM_MAX = 2
const GAP = 110 // separación horizontal al insertar nodos
const LIBRARY_SPACE = 304 // ancho que ocupa la biblioteca a la izquierda
const TOUR_KEY = 'croma-onboarding-v1'
const MOBILE_QUERY = '(max-width: 760px)'
const MOBILE_BAR = 84 // alto reservado para la barra de la biblioteca en móvil

interface View {
  x: number
  y: number
  k: number
}

// Estado vigente que leen los callbacks estables (gestos, loop de dibujo, teclado)
interface LiveState {
  graph: Graph
  view: View
  focus: boolean
  format: Format
  duration: number
  playing: boolean
  selected: string | null
  selectedEdge: string | null
  libraryCollapsed: boolean
  tourOpen: boolean
  isMobile: boolean
}

// Gesto táctil o de puntero sobre el fondo: punteros activos → última posición
interface Gesture {
  pts: Map<number, Point>
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return el && (el.isContentEditable || /^(TEXTAREA|SELECT)$/.test(el.tagName) ||
    (el.tagName === 'INPUT' && !['range', 'color', 'button', 'checkbox'].includes((el as HTMLInputElement).type)))
}

// Curva de un cable entre dos puertos (tangentes horizontales)
function wirePath(a: Point, b: Point) {
  const dx = Math.max(50, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}
function wireMid(a: Point, b: Point): Point {
  const dx = Math.max(50, Math.abs(b.x - a.x) * 0.5)
  // Punto medio de la Bézier cúbica: (P0 + 3P1 + 3P2 + P3) / 8
  return { x: (a.x + 3 * (a.x + dx) + 3 * (b.x - dx) + b.x) / 8, y: (a.y + 3 * a.y + 3 * b.y + b.y) / 8 }
}

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const glRef = useRef<{ renderer: THREE.WebGLRenderer; engine: GraphEngine } | null>(null)
  const imagesRef = useRef<ImageMap>(new Map())
  const resultsRef = useRef(new Map<string, InputTexture>())
  const dirtyRef = useRef(true)
  const rafRef = useRef(0)
  const timeRef = useRef(0)
  const progressRef = useRef<HTMLInputElement>(null)
  const timeLabelRef = useRef<HTMLSpanElement>(null)
  const focusRef = useRef<HTMLDivElement>(null)

  const [graph, setGraph] = useState(initialGraph)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<View>({ x: LIBRARY_SPACE + 60, y: 120, k: 0.9 })
  const [selected, setSelected] = useState<string | null>(null)
  // Cable en curso: desde qué nodo y punta en coordenadas del lienzo
  const [connecting, setConnecting] = useState<({ from: string } & Point) | null>(null)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null)
  // Cable seleccionado con toque/clic: su × queda visible (en móvil no hay hover)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [focus, setFocus] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [imageNames, setImageNames] = useState<Record<string, string>>({})
  const [tourOpen, setTourOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const gestureRef = useRef<Gesture | null>(null)

  // Móvil: la biblioteca es una hoja inferior, plegada al empezar
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mq.matches)
    update()
    if (mq.matches) setLibraryCollapsed(true)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  // WebCodecs solo existe en el navegador: se consulta tras montar (evita desajuste de hidratación)
  const [videoSupported, setVideoSupported] = useState(false)
  useEffect(() => setVideoSupported(canExportVideo()), [])

  const format = graphFormat(graph)
  const aspect = format.w / format.h
  const duration = graph.output.duration
  const outputNode = graph.nodes.find((n) => n.type === 'output')

  // Estado vigente para callbacks estables (gestos, loop de dibujo)
  const live = useRef<LiveState>(null!)
  live.current = { graph, view, focus, format, duration, playing, selected, selectedEdge, libraryCollapsed, tourOpen, isMobile }

  const loopT = () => (timeRef.current % live.current.duration) / live.current.duration

  // ------------------------------------------------------------------ dibujo

  const draw = useCallback(() => {
    rafRef.current = 0
    const gl = glRef.current
    if (!gl) return
    const { graph, format, focus } = live.current
    if (dirtyRef.current) {
      const scale = Math.min(1, WORK_MAX / Math.max(format.w, format.h))
      resultsRef.current = gl.engine.evaluate(graph, {
        width: Math.round(format.w * scale),
        height: Math.round(format.h * scale),
        res: format,
        t: loopT(),
      })
      dirtyRef.current = false
    }
    gl.engine.clear()
    const H = window.innerHeight
    const W = window.innerWidth
    const blitEl = (el: Element, id: string | undefined) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.right < 0 || r.left > W || r.bottom < 0 || r.top > H) return
      gl.engine.blit((id && resultsRef.current.get(id)) || null, { x: r.left, y: H - r.bottom, w: r.width, h: r.height })
    }
    if (focus && focusRef.current) {
      const out = live.current.graph.nodes.find((n) => n.type === 'output')
      blitEl(focusRef.current, out?.id)
    } else {
      document.querySelectorAll<HTMLElement>('[data-preview]').forEach((el) => blitEl(el, el.dataset.preview))
    }
  }, [])

  const requestDraw = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(draw)
  }, [draw])

  const syncTimeline = useCallback(() => {
    const t = loopT()
    if (progressRef.current) progressRef.current.value = String(t * 1000)
    if (timeLabelRef.current) {
      const d = live.current.duration
      timeLabelRef.current.textContent = `${(t * d).toFixed(1)} / ${d.toFixed(1)} s`
    }
  }, [])

  // Renderer WebGL a pantalla completa, detrás de las tarjetas
  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current!, alpha: true, antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    glRef.current = { renderer, engine: new GraphEngine(renderer, imagesRef.current) }
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false)
      requestDraw()
    }
    window.addEventListener('resize', onResize)
    requestDraw()
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      glRef.current?.engine.dispose()
      renderer.dispose()
      glRef.current = null
    }
  }, [requestDraw])

  // Solo lo que afecta a la imagen invalida el render (mover nodos solo redibuja las previews)
  const renderKey = useMemo(
    () =>
      JSON.stringify({
        nodes: graph.nodes.map(({ x, y, ...n }) => n),
        edges: graph.edges,
        formatId: graph.output.formatId,
        duration: graph.output.duration,
      }),
    [graph],
  )
  useEffect(() => {
    dirtyRef.current = true
    requestDraw()
    syncTimeline()
  }, [renderKey, requestDraw, syncTimeline])

  // Cualquier render de React (pan, zoom, arrastre…) mueve las previews: redibujar
  useEffect(() => {
    requestDraw()
  })

  // ------------------------------------------------------------ persistencia

  useEffect(() => {
    const saved = loadGraph()
    if (saved) setGraph(saved)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => saveGraph(graph), 300)
    return () => clearTimeout(t)
  }, [graph, loaded])

  // --------------------------------------------------------- reproducción

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      timeRef.current = (timeRef.current + (now - last) / 1000) % live.current.duration
      last = now
      dirtyRef.current = true
      draw()
      syncTimeline()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, draw, syncTimeline])

  const scrub = (fraction: number) => {
    timeRef.current = fraction * duration
    dirtyRef.current = true
    requestDraw()
    syncTimeline()
  }

  // ------------------------------------------------------- edición del grafo

  const updateNode = (id: string, patch: Partial<GraphNode>) =>
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))

  const setParam = (id: string, key: string, value: ParamValue) =>
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)),
    }))

  const setOutput = (patch: Partial<OutputSettings>) => setGraph((g) => ({ ...g, output: { ...g.output, ...patch } }))

  const connect = (from: string, to: string, port: string) =>
    setGraph((g) => {
      if (wouldCycle(g, from, to)) return g
      return { ...g, edges: [...g.edges.filter((e) => !(e.to === to && e.port === port)), { from, to, port }] }
    })

  const removeEdge = (edge: Pick<Edge, 'to' | 'port'>) =>
    setGraph((g) => ({ ...g, edges: g.edges.filter((e) => !(e.to === edge.to && e.port === edge.port)) }))

  // Al borrar un nodo intermedio se reconecta lo que entraba con lo que salía
  const deleteNode = (id: string) =>
    setGraph((g) => {
      const node = g.nodes.find((n) => n.id === id)
      if (!node || node.type === 'output') return g
      const def = NODE_TYPES[node.type]
      const source = g.edges.find((e) => e.to === id && e.port === def.inputs[0])?.from
      const outs = g.edges.filter((e) => e.from === id)
      let edges = g.edges.filter((e) => e.from !== id && e.to !== id)
      if (source) edges = [...edges, ...outs.map((e) => ({ ...e, from: source }))]
      imagesRef.current.get(id)?.dispose()
      imagesRef.current.delete(id)
      return { ...g, nodes: g.nodes.filter((n) => n.id !== id), edges }
    })

  // Añadir desde la biblioteca: en una posición concreta (arrastre) o insertado antes de la salida
  const addNode = (type: string, at?: Point) => {
    const def = NODE_TYPES[type]
    setGraph((g) => {
      if (at) return { ...g, nodes: [...g.nodes, createNode(type, at.x, at.y)] }
      const out = g.nodes.find((n) => n.type === 'output')
      if (!out) return g
      const into = g.edges.find((e) => e.to === out.id && e.port === 'in')
      const prev = into && g.nodes.find((n) => n.id === into.from)

      if (def.inputs.length === 0) {
        // Fuente nueva: debajo de las demás; solo se conecta si la salida está vacía
        const bottom = Math.max(...g.nodes.map((n) => n.y + HEADER_H + previewHeight(n, aspect) + 280))
        const node = createNode(type, prev ? prev.x : out.x - 420, bottom + 40)
        return {
          ...g,
          nodes: [...g.nodes, node],
          edges: into ? g.edges : [...g.edges, { from: node.id, to: out.id, port: 'in' }],
        }
      }

      const x = prev ? prev.x + nodeWidth(prev) + GAP : out.x - nodeWidth({ type }) - GAP
      const node = createNode(type, x, prev ? prev.y : out.y)
      const minOutX = x + nodeWidth(node) + GAP
      const nodes = [...g.nodes.map((n) => (n.id === out.id && n.x < minOutX ? { ...n, x: minOutX } : n)), node]
      let edges = g.edges.filter((e) => e !== into)
      if (prev) edges = [...edges, { from: prev.id, to: node.id, port: def.inputs[0] }]
      edges = [...edges, { from: node.id, to: out.id, port: 'in' }]
      return { ...g, nodes, edges }
    })
  }

  const resetCanvas = () => {
    for (const tex of imagesRef.current.values()) tex.dispose()
    imagesRef.current.clear()
    setImageNames({})
    setGraph(initialGraph())
    setSelected(null)
    timeRef.current = 0
    setTimeout(() => fitView(), 0)
  }

  const loadImage = async (id: string, file: File) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    await img.decode()
    const tex = new THREE.Texture(img)
    tex.needsUpdate = true
    imagesRef.current.get(id)?.dispose()
    imagesRef.current.set(id, tex)
    setImageNames((m) => ({ ...m, [id]: file.name }))
    setParam(id, 'imageName', file.name)
    dirtyRef.current = true
    requestDraw()
  }

  // ------------------------------------------------------------ vista

  const toGraph = (clientX: number, clientY: number): Point => {
    const { view } = live.current
    return { x: (clientX - view.x) / view.k, y: (clientY - view.y) / view.k }
  }

  // Área libre para encajar contenido: a la derecha de la biblioteca (escritorio)
  // o encima de su barra inferior (móvil)
  const freeArea = () => {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      return { left: 16, top: 16, w: window.innerWidth - 32, h: window.innerHeight - 32 - MOBILE_BAR }
    }
    const left = live.current.libraryCollapsed ? 40 : LIBRARY_SPACE + 30
    return { left, top: 30, w: window.innerWidth - left - 40, h: window.innerHeight - 60 }
  }

  const fitBox = (x0: number, y0: number, x1: number, y1: number, maxK = 1) => {
    const area = freeArea()
    const k = Math.min(maxK, Math.max(ZOOM_MIN, Math.min(area.w / (x1 - x0), area.h / (y1 - y0))))
    setView({ k, x: area.left + (area.w - (x1 - x0) * k) / 2 - x0 * k, y: area.top + (area.h - (y1 - y0) * k) / 2 - y0 * k })
  }

  const nodeBox = (n: GraphNode, a: number) => ({
    x0: n.x,
    y0: n.y,
    x1: n.x + nodeWidth(n),
    y1: n.y + HEADER_H + previewHeight(n, a) + (n.type === 'output' ? 330 : 260),
  })

  // Doble toque / doble clic en la cabecera: acerca la vista a ese nodo
  const zoomToNode = (id: string) => {
    const { graph, format } = live.current
    const n = graph.nodes.find((x) => x.id === id)
    if (!n) return
    const b = nodeBox(n, format.w / format.h)
    fitBox(b.x0 - 20, b.y0 - 20, b.x1 + 20, b.y1 + 20, 1.4)
  }

  const fitView = () => {
    const { graph, format } = live.current
    const a = format.w / format.h
    const boxes = graph.nodes.map((n) => ({
      x0: n.x,
      y0: n.y,
      x1: n.x + nodeWidth(n),
      y1: n.y + HEADER_H + previewHeight(n, a) + (n.type === 'output' ? 330 : 260),
    }))
    const x0 = Math.min(...boxes.map((b) => b.x0))
    const y0 = Math.min(...boxes.map((b) => b.y0))
    const x1 = Math.max(...boxes.map((b) => b.x1))
    const y1 = Math.max(...boxes.map((b) => b.y1))
    fitBox(x0, y0, x1, y1)
  }

  useEffect(() => {
    if (!loaded) return
    fitView()
    // Guía rápida la primera vez (tras encuadrar la vista, para que los resaltados caigan en su sitio)
    let seen = true
    try {
      seen = localStorage.getItem(TOUR_KEY) === 'done'
    } catch {}
    if (!seen) {
      const t = setTimeout(() => setTourOpen(true), 500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const closeTour = useCallback(() => {
    setTourOpen(false)
    try {
      localStorage.setItem(TOUR_KEY, 'done')
    } catch {}
  }, [])

  const openTour = () => {
    setLibraryCollapsed(false)
    setFocus(false)
    fitView()
    setTimeout(() => setTourOpen(true), 50)
  }

  // Pan con arrastre del fondo, rueda para desplazar, Ctrl/⌘ + rueda (o pinza) para zoom
  useEffect(() => {
    const el = workspaceRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * Math.exp(-e.deltaY * 0.01)))
          return { k, x: e.clientX - ((e.clientX - v.x) * k) / v.k, y: e.clientY - ((e.clientY - v.y) * k) / v.k }
        })
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Arrastre genérico con captura en window
  const drag = (
    e: PointerEvent,
    onMove: (ev: globalThis.PointerEvent, dx: number, dy: number) => void,
    onUp?: (ev: globalThis.PointerEvent) => void,
  ) => {
    e.preventDefault()
    let lastX = e.clientX
    let lastY = e.clientY
    const move = (ev: globalThis.PointerEvent) => {
      onMove(ev, ev.clientX - lastX, ev.clientY - lastY)
      lastX = ev.clientX
      lastY = ev.clientY
    }
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onUp?.(ev)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startGesture = () => {
    const g: Gesture = { pts: new Map() }
    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    const move = (ev: globalThis.PointerEvent) => {
      const prev = g.pts.get(ev.pointerId)
      if (!prev) return
      const cur = { x: ev.clientX, y: ev.clientY }
      if (g.pts.size >= 2) {
        const [[ida, pa], [, pb]] = [...g.pts.entries()]
        const a = ida === ev.pointerId ? cur : pa
        const b = ida === ev.pointerId ? pb : cur
        const d0 = dist(pa, pb)
        const m0 = mid(pa, pb)
        const m1 = mid(a, b)
        const f = d0 > 0 ? dist(a, b) / d0 : 1
        // El punto bajo los dedos se mantiene bajo los dedos
        setView((v) => {
          const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * f))
          return { k, x: m1.x - ((m0.x - v.x) * k) / v.k, y: m1.y - ((m0.y - v.y) * k) / v.k }
        })
      } else {
        setView((v) => ({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }))
      }
      g.pts.set(ev.pointerId, cur)
    }
    // Un segundo dedo cuenta aunque caiga sobre una tarjeta
    const down = (ev: globalThis.PointerEvent) => {
      if (ev.pointerType === 'touch') g.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    }
    const up = (ev: globalThis.PointerEvent) => {
      g.pts.delete(ev.pointerId)
      if (g.pts.size === 0) {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.removeEventListener('pointerdown', down, true)
        gestureRef.current = null
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('pointerdown', down, true)
    return g
  }

  const onWorkspaceDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.backdrop) return
    e.preventDefault()
    setSelected(null)
    setSelectedEdge(null)
    gestureRef.current ??= startGesture()
    gestureRef.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  const lastTapRef = useRef<{ id: string | null; t: number }>({ id: null, t: 0 })
  const onHeaderDown = (e: PointerEvent, id: string) => {
    if (e.button !== 0) return
    // Doble toque táctil (el dblclick no es fiable con touch-action: none). Se mide con la marca
    // de tiempo del evento —cuándo tocó el dedo— y no con la hora de proceso, que se retrasa
    // si el primer toque provoca un render
    if (e.pointerType === 'touch') {
      const now = e.timeStamp
      if (lastTapRef.current.id === id && now - lastTapRef.current.t < 350) {
        lastTapRef.current = { id: null, t: 0 }
        zoomToNode(id)
        return
      }
      lastTapRef.current = { id, t: now }
    }
    setSelected(id)
    drag(e, (ev, dx, dy) => {
      const k = live.current.view.k
      setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, x: n.x + dx / k, y: n.y + dy / k } : n)) }))
    })
  }

  const startConnect = (e: PointerEvent, from: string) => {
    const p = toGraph(e.clientX, e.clientY)
    setConnecting({ from, ...p })
    drag(
      e,
      (ev) => setConnecting((c) => c && { ...c, ...toGraph(ev.clientX, ev.clientY) }),
      (ev) => {
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-port-in]')
        const { node, port } = target?.dataset ?? {}
        if (node && port) connect(from, node, port)
        setConnecting(null)
      },
    )
  }

  // Arrastrar desde una entrada conectada la desengancha para llevar el cable a otro sitio
  const onInDown = (e: PointerEvent, id: string, port: string) => {
    e.stopPropagation()
    const edge = live.current.graph.edges.find((x) => x.to === id && x.port === port)
    if (!edge) return
    removeEdge(edge)
    startConnect(e, edge.from)
  }

  const onOutDown = (e: PointerEvent, id: string) => {
    e.stopPropagation()
    startConnect(e, id)
  }

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData('application/x-croma-node')
    if (!type) return
    e.preventDefault()
    const p = toGraph(e.clientX, e.clientY)
    addNode(type, { x: p.x - nodeWidth({ type }) / 2, y: p.y - HEADER_H / 2 })
  }

  // ---------------------------------------------------------------- export

  const onExportPNG = async () => {
    const { blob, name } = await exportPNG(graph, imagesRef.current, loopT())
    downloadBlob(blob, name)
  }

  const onExportMP4 = async () => {
    if (exportProgress !== null) return
    setPlaying(false)
    setExportProgress(0)
    try {
      const { blob, name } = await exportMP4(graph, imagesRef.current, { onProgress: setExportProgress })
      downloadBlob(blob, name)
    } catch (err) {
      console.error(err)
      alert(`No se pudo exportar el video: ${err instanceof Error ? err.message : err}`)
    } finally {
      setExportProgress(null)
    }
  }

  // --------------------------------------------------------------- teclado

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || live.current.tourOpen) return
      const { selected, selectedEdge, focus } = live.current
      if (e.key === 'Escape') {
        if (focus) setFocus(false)
        setConnecting(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdge && !focus) {
        e.preventDefault()
        const [to, port] = selectedEdge.split(':')
        removeEdge({ to, port })
        setSelectedEdge(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !focus) {
        e.preventDefault()
        deleteNode(selected)
        setSelected(null)
      } else if (e.key === ' ' && !/^(BUTTON|INPUT)$/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        setPlaying((v) => !v)
      } else if (e.key === 'f' || e.key === 'F') {
        fitView()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --------------------------------------------------------------- render

  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const connectedInputs = (id: string) => new Set(graph.edges.filter((e) => e.to === id).map((e) => e.port))

  const outputBody = (
    <OutputBody
      output={graph.output}
      onOutput={setOutput}
      playing={playing}
      onTogglePlay={() => setPlaying((v) => !v)}
      onScrub={scrub}
      progressRef={progressRef}
      timeLabelRef={timeLabelRef}
      onExportPNG={onExportPNG}
      onExportMP4={onExportMP4}
      exportProgress={exportProgress}
      videoSupported={videoSupported}
    />
  )

  return (
    <div className={s.root}>
      <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />

      <div
        ref={workspaceRef}
        className={`${s.workspace} ${focus ? s.hidden : ''}`}
        style={{
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
        }}
        onPointerDown={onWorkspaceDown}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className={s.layer} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className={s.wires} aria-hidden="true">
            {graph.edges.map((e) => {
              const from = byId.get(e.from)
              const to = byId.get(e.to)
              if (!from || !to) return null
              const a = portPosition(from, 'out', aspect)
              const b = portPosition(to, e.port, aspect)
              const key = `${e.to}:${e.port}`
              return (
                <g key={key} onPointerEnter={() => setHoverEdge(key)} onPointerLeave={() => setHoverEdge(null)}>
                  <path
                    className={s.wireHit}
                    d={wirePath(a, b)}
                    onPointerDown={(ev) => {
                      ev.stopPropagation()
                      setSelected(null)
                      setSelectedEdge(key)
                    }}
                  />
                  <path
                    className={`${s.wire} ${hoverEdge === key || selectedEdge === key ? s.wireHover : ''}`}
                    d={wirePath(a, b)}
                  />
                </g>
              )
            })}
            {connecting &&
              (() => {
                const from = byId.get(connecting.from)
                if (!from) return null
                return <path className={`${s.wire} ${s.wireDraft}`} d={wirePath(portPosition(from, 'out', aspect), connecting)} />
              })()}
          </svg>

          {/* Botón para quitar el cable bajo el puntero */}
          {graph.edges.map((e) => {
            const key = `${e.to}:${e.port}`
            if (hoverEdge !== key && selectedEdge !== key) return null
            const from = byId.get(e.from)
            const to = byId.get(e.to)
            if (!from || !to) return null
            const m = wireMid(portPosition(from, 'out', aspect), portPosition(to, e.port, aspect))
            return (
              <button
                key={key}
                type="button"
                className={s.cut}
                style={{ left: m.x, top: m.y, transform: `scale(${1 / view.k})` }}
                onPointerEnter={() => setHoverEdge(key)}
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => {
                  removeEdge(e)
                  setHoverEdge(null)
                  setSelectedEdge(null)
                }}
                aria-label="Desconectar"
                title="Desconectar"
              >
                ×
              </button>
            )
          })}

          {graph.nodes.map((node) => {
            const def = NODE_TYPES[node.type]
            const isOutput = node.type === 'output'
            return (
              <NodeCard
                key={node.id}
                node={node}
                def={def}
                aspect={aspect}
                selected={selected === node.id}
                connectedInputs={connectedInputs(node.id)}
                connecting={connecting !== null && connecting.from !== node.id}
                imageName={imageNames[node.id]}
                onSelect={(id) => {
                  setSelected(id)
                  setSelectedEdge(null)
                }}
                onHeaderDown={onHeaderDown}
                onHeaderDoubleClick={zoomToNode}
                onToggleBypass={(id) => updateNode(id, { bypass: !byId.get(id)?.bypass })}
                onDelete={deleteNode}
                onParam={setParam}
                onOutDown={onOutDown}
                onInDown={onInDown}
                onFile={loadImage}
                headerExtra={
                  isOutput && (
                    <button
                      type="button"
                      className={s.headerBtn}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setFocus(true)}
                      title="Ver a pantalla completa"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                      </svg>
                    </button>
                  )
                }
              >
                {isOutput ? outputBody : null}
              </NodeCard>
            )
          })}
        </div>
      </div>

      {focus && (
        <div className={s.focus}>
          <div className={s.focusBar}>
            <span className={s.focusTitle}>
              Salida · {format.w}×{format.h}
            </span>
            <button type="button" className={s.focusBtn} onClick={() => setPlaying((v) => !v)}>
              {playing ? 'Pausar' : 'Reproducir'}
            </button>
            <button type="button" className={s.focusBtn} onClick={() => setFocus(false)} title="Cerrar (Esc)">
              Cerrar
            </button>
          </div>
          <div className={s.focusStage}>
            <div ref={focusRef} className={s.focusFrame} style={{ '--ar': aspect } as CSSProperties} />
          </div>
        </div>
      )}

      {!focus && (
        <Library
          collapsed={libraryCollapsed}
          onToggle={() => setLibraryCollapsed((v) => !v)}
          onAdd={(type) => {
            addNode(type)
            if (isMobile) {
              setLibraryCollapsed(true)
              setTimeout(() => fitView(), 0)
            }
          }}
          onFit={fitView}
          onReset={resetCanvas}
          onHelp={openTour}
        />
      )}

      <Onboarding open={tourOpen} onClose={closeTour} />

      {!outputNode && <p className={s.warning}>Falta el nodo de salida</p>}
    </div>
  )
}
