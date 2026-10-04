// Formatos de salida: el preview adopta la proporción y el PNG se exporta al tamaño real
export const formats = [
  { id: 'og', ratio: '1.91:1', name: 'Open Graph', w: 1200, h: 630 },
  { id: 'wide', ratio: '16:9', name: 'Horizontal', w: 1920, h: 1080 },
  { id: 'classic', ratio: '3:2', name: 'Clásico', w: 1800, h: 1200 },
  { id: 'square', ratio: '1:1', name: 'Cuadrado', w: 1080, h: 1080 },
  { id: 'portrait', ratio: '4:5', name: 'Retrato', w: 1080, h: 1350 },
  { id: 'story', ratio: '9:16', name: 'Historia', w: 1080, h: 1920 },
]
