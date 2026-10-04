// Geometría del zoom de vista del lienzo (todo en px CSS, relativo al escenario).
// scale = px CSS por px de export: 1 = 100% (tamaño real).

export const MAX_SCALE = 8
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]

// view = { zoom: null | scale, panX, panY }   (zoom null = ajustar a la pantalla)
export const FIT_VIEW = { zoom: null, panX: 0, panY: 0 }

export function fitScale(stage, format) {
  const { w, h, pad } = stage
  return Math.min((w - pad.l - pad.r) / format.w, (h - pad.t - pad.b) / format.h)
}

export const minScale = (fit) => Math.min(fit, 0.1)

// Limita el paneo para que la imagen no se pierda fuera del escenario
export function clampPan(stage, format, scale, panX, panY) {
  const fit = fitScale(stage, format)
  if (scale <= fit) return { panX: 0, panY: 0 }
  const limX = Math.max(0, (format.w * scale - stage.w) / 2 + stage.pad.l)
  const limY = Math.max(0, (format.h * scale - stage.h) / 2 + stage.pad.t)
  return {
    panX: Math.min(limX, Math.max(-limX, panX)),
    panY: Math.min(limY, Math.max(-limY, panY)),
  }
}

export function computeLayout(stage, format, view) {
  const fit = fitScale(stage, format)
  const scale = view.zoom ?? fit
  const { panX, panY } = clampPan(stage, format, scale, view.panX, view.panY)

  const w = format.w * scale
  const h = format.h * scale
  const cx = stage.pad.l + (stage.w - stage.pad.l - stage.pad.r) / 2 + panX
  const cy = stage.pad.t + (stage.h - stage.pad.t - stage.pad.b) / 2 + panY
  const img = { left: cx - w / 2, top: cy - h / 2, w, h }

  // Parte visible de la imagen (recortada al escenario), en píxeles enteros
  const left = Math.max(0, Math.round(img.left))
  const top = Math.max(0, Math.round(img.top))
  const right = Math.min(stage.w, Math.round(img.left + w))
  const bottom = Math.min(stage.h, Math.round(img.top + h))
  const vis = { left, top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }

  return { fit, scale, img, vis, zoomed: scale > fit + 1e-6 }
}

// Nueva vista con zoom `nextScale` manteniendo fijo el punto (x, y) del escenario
export function zoomAt(stage, format, layout, nextScale, x, y) {
  const fit = layout.fit
  const scale = Math.min(MAX_SCALE, Math.max(minScale(fit), nextScale))
  const ix = (x - layout.img.left) / layout.scale
  const iy = (y - layout.img.top) / layout.scale
  const baseX = stage.pad.l + (stage.w - stage.pad.l - stage.pad.r) / 2 - (format.w * scale) / 2
  const baseY = stage.pad.t + (stage.h - stage.pad.t - stage.pad.b) / 2 - (format.h * scale) / 2
  const pan = clampPan(stage, format, scale, x - ix * scale - baseX, y - iy * scale - baseY)
  return { zoom: scale, ...pan }
}

export function stepScale(scale, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > scale + 1e-6) ?? MAX_SCALE
  return [...ZOOM_STEPS].reverse().find((s) => s < scale - 1e-6) ?? ZOOM_STEPS[0]
}
