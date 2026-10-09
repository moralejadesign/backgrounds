import type * as THREE from 'three'
import type { GraphEngine } from './engine'

// Tipos compartidos del grafo: definiciones de nodo, controles y el grafo guardado.

export type ParamValue = number | string | boolean

// Los parámetros dependen del tipo de nodo (sus claves salen de los controles); se leen
// directamente en apply/animate, así que se tipan de forma abierta.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Params = Record<string, any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Uniforms = Record<string, THREE.IUniform<any>>

// [valor, etiqueta]
export type Option = readonly [string, string]

interface ControlBase {
  key: string
  label: string
  // [clave, valor]: el control se atenúa cuando el parámetro clave no vale eso
  activeWhen?: readonly [string, ParamValue]
  // clave de un interruptor: el control se atenúa mientras esté apagado
  dependsOn?: string
  // fijado por el efecto con su valor por defecto: no se muestra en el panel
  hidden?: boolean
}

export interface RangeControl extends ControlBase {
  type?: 'range'
  value: number
  min: number
  max: number
  step: number
  unit?: string
}

export interface SelectControl extends ControlBase {
  type: 'select'
  value: string
  options: readonly Option[]
}

export interface ToggleControl extends ControlBase {
  type: 'toggle'
  value: boolean
}

export interface ColorControl extends ControlBase {
  type: 'color'
  value: string
}

export type Control = RangeControl | SelectControl | ToggleControl | ColorControl

export interface ControlGroup {
  id: string
  title: string
  controls: Control[]
}

export type Category = 'source' | 'effect' | 'filter' | 'motion' | 'ascii' | 'combine' | 'output'

export interface Entry {
  type: string
  material: THREE.ShaderMaterial
  rt: THREE.WebGLRenderTarget
  tmp: THREE.WebGLRenderTarget | null
}

export interface ApplyContext {
  t: number
  engine: GraphEngine
  nodeId: string
}

export type InputTexture = THREE.Texture | null

// Texturas de los nodos Imagen (nodeId → textura de la foto subida)
export type ImageMap = Map<string, THREE.Texture<HTMLImageElement>>

export interface NodeDef {
  type: string
  title: string
  category: Category
  description?: string
  glyph?: string
  inputs: string[]
  groups: ControlGroup[]
  hasFile?: boolean
  fragment?: string
  uniforms?: () => Uniforms
  apply?: (u: Uniforms, p: Params, ctx: ApplyContext) => void
  animate?: (p: Params, t: number, motion: string, cycles: number) => Params
  // Varias pasadas: el nodo dibuja él mismo en entry.rt
  render?: (engine: GraphEngine, entry: Entry, inputs: InputTexture[], p: Params) => void
}

// --- Grafo ---

export interface GraphNode {
  id: string
  type: string
  x: number
  y: number
  bypass: boolean
  params: Params
}

export interface Edge {
  from: string
  to: string
  port: string
}

export interface OutputSettings {
  formatId: string
  duration: number
  fps: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: Edge[]
  output: OutputSettings
}

export interface Point {
  x: number
  y: number
}
