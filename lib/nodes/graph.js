import { NODE_TYPES } from './index'
import { defaultsOf } from './common'
import { formats } from '../formats'

// Geometría de las tarjetas (en coordenadas del lienzo): los puertos se calculan a partir
// de los datos, sin medir el DOM, para que los cables se dibujen siempre en su sitio.
export const NODE_W = 284
export const OUTPUT_W = 380
export const HEADER_H = 44

export const nodeWidth = (node) => (node.type === 'output' ? OUTPUT_W : NODE_W)
export const previewHeight = (node, aspect) => nodeWidth(node) / aspect

export function portPosition(node, port, aspect) {
  const def = NODE_TYPES[node.type]
  const cy = node.y + HEADER_H + previewHeight(node, aspect) / 2
  if (port === 'out') return { x: node.x + nodeWidth(node), y: cy }
  const i = def.inputs.indexOf(port)
  const spread = def.inputs.length > 1 ? (i - (def.inputs.length - 1) / 2) * 44 : 0
  return { x: node.x, y: cy + spread }
}

let counter = 0
const newId = (type) => `${type}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function createNode(type, x, y) {
  const def = NODE_TYPES[type]
  return { id: newId(type), type, x, y, bypass: false, params: def.groups.length ? defaultsOf(def) : {} }
}

// Preset inicial: imagen 1:1, fondo oscuro con un degradado de luz, directo a la salida
export function initialGraph() {
  const source = { ...createNode('gradient', 0, 0), id: 'source' }
  const output = { ...createNode('output', NODE_W + 140, -20), id: 'output' }
  return {
    nodes: [source, output],
    edges: [{ from: 'source', to: 'output', port: 'in' }],
    output: { formatId: 'square', duration: 6, fps: '30' },
  }
}

export const graphFormat = (graph) => formats.find((f) => f.id === graph.output.formatId) ?? formats[0]

// --- Persistencia local (las imágenes subidas no se guardan: pesan demasiado) ---

const STORAGE_KEY = 'croma-graph-v1'

export function loadGraph() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const g = JSON.parse(raw)
    const nodes = (g.nodes ?? [])
      .filter((n) => NODE_TYPES[n.type])
      // Completa con los valores por defecto de controles añadidos después de guardar
      .map((n) => ({ ...n, params: { ...(NODE_TYPES[n.type].groups.length ? defaultsOf(NODE_TYPES[n.type]) : {}), ...n.params } }))
    if (!nodes.some((n) => n.type === 'output')) return null
    const ids = new Set(nodes.map((n) => n.id))
    return {
      nodes,
      edges: (g.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to)),
      output: { formatId: 'square', duration: 6, fps: '30', ...g.output },
    }
  } catch {
    return null
  }
}

export function saveGraph(graph) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graph))
  } catch {
    // Almacenamiento no disponible (modo privado, cuota): el editor sigue funcionando
  }
}
