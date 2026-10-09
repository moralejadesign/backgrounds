import { gradient, image } from './sources'
import { glass, ribbon, holo } from './effects'
import { ascii } from './ascii'
import { dither, blur, grain, motion, mix, output } from './filters'
import type { NodeDef } from './types'

// Cada tipo de nodo define: type, title, category, description, inputs (puertos de entrada),
// groups (controles, una pestaña por grupo), fragment, uniforms(), apply(uniforms, params, ctx)
// y opcionalmente animate(params, t, movimiento, vueltas) y render(engine, ...) para varias pasadas.
export const NODE_TYPES: Record<string, NodeDef> = Object.fromEntries(
  [gradient, image, glass, ribbon, holo, ascii, dither, blur, grain, motion, mix, output].map((d) => [d.type, d]),
)

// Biblioteca del panel izquierdo
export const LIBRARY: { title: string; types: string[] }[] = [
  { title: 'Fuentes', types: ['gradient', 'image'] },
  { title: 'Efectos', types: ['glass', 'ribbon', 'holo', 'ascii'] },
  { title: 'Filtros', types: ['dither', 'blur', 'grain'] },
  { title: 'Movimiento', types: ['motion'] },
  { title: 'Combinar', types: ['mix'] },
]
