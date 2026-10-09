import * as THREE from 'three'
import { NODE_TYPES } from './index'
import { vertexShader, commonUniforms } from './common'
import type { Entry, Graph, GraphNode, ImageMap, InputTexture, NodeDef } from './types'

// Motor del grafo: renderiza cada nodo a su propia textura en orden de dependencias.
// Lo usan el editor (a resolución de trabajo, con previews en pantalla) y el export
// (offscreen, al tamaño real). Las texturas de imagen se comparten entre ambos.

const blitFragment = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform float uHasMap;
varying vec2 vUv;
void main() {
  gl_FragColor = uHasMap > 0.5 ? vec4(clamp(texture2D(tMap, vUv).rgb, 0.0, 1.0), 1.0) : vec4(0.075, 0.075, 0.08, 1.0);
}
`

const RT_OPTIONS: THREE.RenderTargetOptions = {
  type: THREE.HalfFloatType, // precisión extra: sin bandas en degradados ni al encadenar efectos
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: false,
}

// Orden topológico de todo el grafo (también los nodos que no llegan a la salida,
// para que sus previews se vean). Las aristas que formarían ciclos se ignoran.
export function topoOrder(graph: Graph) {
  const deps = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]))
  for (const e of graph.edges) if (deps.has(e.to) && deps.has(e.from)) deps.get(e.to)!.push(e.from)
  const order: string[] = []
  const state = new Map<string, number>()
  const visit = (id: string) => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) return // ciclo
    state.set(id, 1)
    for (const d of deps.get(id) ?? []) visit(d)
    state.set(id, 2)
    order.push(id)
  }
  for (const n of graph.nodes) visit(n.id)
  return order
}

// ¿Conectar from → to crearía un ciclo? (sí, si to ya llega a from)
export function wouldCycle(graph: Graph, from: string, to: string) {
  if (from === to) return true
  const stack = [to]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === from) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of graph.edges) if (e.from === id) stack.push(e.to)
  }
  return false
}

export class GraphEngine {
  renderer: THREE.WebGLRenderer
  images: ImageMap
  entries: Map<string, Entry>
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>
  scene: THREE.Scene
  camera: THREE.Camera
  blitMat: THREE.ShaderMaterial

  constructor(renderer: THREE.WebGLRenderer, images: ImageMap = new Map()) {
    this.renderer = renderer
    this.images = images // nodeId → THREE.Texture (nodos Imagen)
    this.entries = new Map() // nodeId → { type, material, rt, tmp }
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)
    this.camera = new THREE.Camera()
    this.blitMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: blitFragment,
      uniforms: { tMap: { value: null }, uHasMap: { value: 0 } },
    })
  }

  entryFor(node: GraphNode, def: NodeDef, width: number, height: number): Entry {
    let entry = this.entries.get(node.id)
    if (!entry || entry.type !== node.type) {
      if (entry) this.disposeEntry(entry)
      entry = {
        type: node.type,
        material: new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader: def.fragment,
          uniforms: { ...commonUniforms(), ...def.uniforms?.() },
        }),
        rt: new THREE.WebGLRenderTarget(width, height, RT_OPTIONS),
        tmp: null,
      }
      this.entries.set(node.id, entry)
    }
    if (entry.rt.width !== width || entry.rt.height !== height) entry.rt.setSize(width, height)
    return entry
  }

  tempTarget(entry: Entry, width: number, height: number) {
    if (!entry.tmp) entry.tmp = new THREE.WebGLRenderTarget(width, height, RT_OPTIONS)
    if (entry.tmp.width !== width || entry.tmp.height !== height) entry.tmp.setSize(width, height)
    return entry.tmp
  }

  pass(material: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.mesh.material = material
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * Evalúa el grafo completo.
   * @param size  { width, height } resolución de trabajo de las texturas
   * @param res   { w, h } tamaño de export (grano y dithering se anclan a sus píxeles)
   * @param t     instante del loop (0..1)
   * @returns Map nodeId → textura de salida del nodo (la salida devuelve su entrada)
   */
  evaluate(
    graph: Graph,
    { width, height, res, t }: { width: number; height: number; res: { w: number; h: number }; t: number },
  ) {
    const results = new Map<string, InputTexture>()
    const incoming = new Map(graph.edges.map((e) => [`${e.to}:${e.port}`, e.from]))
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))

    for (const id of topoOrder(graph)) {
      const node = byId.get(id)
      const def = node && NODE_TYPES[node.type]
      if (!node || !def) continue
      const inputs = def.inputs.map((port): InputTexture => {
        const from = incoming.get(`${id}:${port}`)
        return from ? results.get(from) ?? null : null
      })

      if (node.type === 'output' || node.bypass) {
        // Nodo desactivado: deja pasar su primera entrada
        results.set(id, inputs[0] ?? null)
        continue
      }

      const p = def.animate && node.params.animOn
        ? def.animate(node.params, t, node.params.animMotion, node.params.animCycles)
        : node.params
      const entry = this.entryFor(node, def, width, height)
      const u = entry.material.uniforms
      u.uAspect.value = res.w / res.h
      u.uGrainRes.value.set(res.w, res.h)
      u.uInput.value = inputs[0]
      u.uHasInput.value = inputs[0] ? 1 : 0
      u.uInputB.value = inputs[1] ?? null
      u.uHasInputB.value = inputs[1] ? 1 : 0
      def.apply?.(u, p, { t, engine: this, nodeId: id })

      if (def.render) def.render(this, entry, inputs, p)
      else this.pass(entry.material, entry.rt)
      results.set(id, entry.rt.texture)
    }

    // Libera los nodos que ya no existen
    for (const [id, entry] of this.entries) {
      if (!byId.has(id)) {
        this.disposeEntry(entry)
        this.entries.delete(id)
      }
    }
    return results
  }

  clear() {
    this.renderer.setRenderTarget(null)
    this.renderer.setScissorTest(false)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.clear()
  }

  // Dibuja una textura en un rectángulo del lienzo (px CSS, origen abajo a la izquierda;
  // three aplica el pixel ratio en setViewport/setScissor)
  blit(texture: InputTexture, { x, y, w, h }: { x: number; y: number; w: number; h: number }) {
    const r = this.renderer
    r.setRenderTarget(null)
    r.setViewport(x, y, w, h)
    r.setScissor(x, y, w, h)
    r.setScissorTest(true)
    this.blitMat.uniforms.tMap.value = texture
    this.blitMat.uniforms.uHasMap.value = texture ? 1 : 0
    this.mesh.material = this.blitMat
    r.render(this.scene, this.camera)
    r.setScissorTest(false)
  }

  disposeEntry(entry: Entry) {
    entry.material.dispose()
    entry.rt.dispose()
    entry.tmp?.dispose()
  }

  dispose() {
    for (const entry of this.entries.values()) this.disposeEntry(entry)
    this.entries.clear()
    this.blitMat.dispose()
    this.mesh.geometry.dispose()
  }
}
