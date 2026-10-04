// Animación en loop: cada efecto declara movimientos que modifican sus parámetros en función
// de t (0..1 a lo largo del loop). Todos están diseñados para que t = 1 empalme con t = 0:
// ángulos que dan vueltas completas, tonos que recorren el ciclo entero, vaivenes senoidales.

export const animationGroup = (motions, defaultMotion = motions[0][0]) => ({
  id: 'animation',
  title: 'Animación',
  controls: [
    { key: 'animOn', label: 'activar', type: 'toggle', value: false },
    { key: 'animMotion', label: 'movimiento', type: 'select', value: defaultMotion, options: motions, dependsOn: 'animOn' },
    { key: 'animDuration', label: 'duración', value: 6, min: 2, max: 20, step: 0.5, unit: 's', dependsOn: 'animOn' },
    { key: 'animCycles', label: 'vueltas', value: 1, min: 1, max: 4, step: 1, dependsOn: 'animOn' },
    {
      key: 'animFps',
      label: 'fps video',
      type: 'select',
      value: '30',
      dependsOn: 'animOn',
      options: [
        ['30', '30 fps'],
        ['60', '60 fps'],
      ],
    },
  ],
})

export const isAnimated = (effect, params) => Boolean(effect.animate && params.animOn)

// Parámetros efectivos en el instante t del loop
export function animatedParams(effect, params, t) {
  if (!isAnimated(effect, params)) return params
  return effect.animate(params, t, params.animMotion, params.animCycles)
}

// Movimientos reutilizables (devuelven solo los parámetros que cambian)
export const TAU = Math.PI * 2
export const turn = (base, t, cycles, full = 360) => base + full * cycles * t
export const breathe = (base, t, cycles, amplitude) => base + amplitude * Math.sin(TAU * cycles * t)
