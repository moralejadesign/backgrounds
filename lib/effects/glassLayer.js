import { DEG } from './common'

// Capa de vidrio acanalado, compartida por los efectos.
// Cada efecto: añade glassGroup() a sus grupos, inserta glassGLSL después de su función rot(),
// pasa su coordenada por glassWarp() y aplica glassShade/glassHl al final.

const SHAPES = ['lines', 'irregular', 'wave', 'zigzag', 'pattern']
const DIST_SHAPES = ['prism', 'lens', 'contour', 'cascade', 'flat']

// Controles extra (curvatura, irregularidad, escalonado): solo los efectos que los piden los muestran;
// en los demás los uniforms quedan en valores neutros y no cambian nada
const EXTRA_CONTROLS = [
  { key: 'glassCurve', label: 'curvatura', value: 1, min: 0.2, max: 4, step: 0.01, dependsOn: 'glassOn' },
  { key: 'glassIrregular', label: 'irregularidad', value: 0, min: 0, max: 1, step: 0.01, dependsOn: 'glassOn' },
  { key: 'glassSlide', label: 'escalonado', value: 0, min: -1, max: 1, step: 0.01, dependsOn: 'glassOn' },
]

// hide: controles que el efecto fija con su valor por defecto y no muestra en el panel
export const glassGroup = ({ title = 'Vidrio', on = true, extras = false, defaults = {}, hide = [] } = {}) => {
  const controls = [...BASE_CONTROLS(on)]
  if (extras) controls.splice(controls.findIndex((c) => c.key === 'glassDistortion') + 1, 0, ...EXTRA_CONTROLS)
  return {
    id: 'glassLayer',
    title,
    controls: controls.map((c) => ({
      ...c,
      ...(c.key in defaults && { value: defaults[c.key] }),
      ...(hide.includes(c.key) && { hidden: true }),
    })),
  }
}

const BASE_CONTROLS = (on) => [
    { key: 'glassOn', label: 'activar', type: 'toggle', value: on },
    { key: 'glassShadows', label: 'sombras', value: 0.57, min: 0, max: 1, step: 0.01, dependsOn: 'glassOn' },
    { key: 'glassHighlights', label: 'brillos', value: 0.76, min: 0, max: 1, step: 0.01, dependsOn: 'glassOn' },
    { key: 'glassSize', label: 'tamaño', value: 0.85, min: 0, max: 1, step: 0.01, dependsOn: 'glassOn' },
    {
      key: 'glassShape',
      label: 'forma',
      type: 'select',
      value: 'lines',
      dependsOn: 'glassOn',
      options: [
        ['lines', 'Líneas'],
        ['irregular', 'Líneas irregulares'],
        ['wave', 'Onda'],
        ['zigzag', 'Zigzag'],
        ['pattern', 'Patrón'],
      ],
    },
    { key: 'glassAngle', label: 'ángulo', value: 0, min: -90, max: 90, step: 1, unit: '°', dependsOn: 'glassOn' },
    {
      key: 'glassDistShape',
      label: 'perfil',
      type: 'select',
      value: 'prism',
      dependsOn: 'glassOn',
      options: [
        ['prism', 'Prisma'],
        ['lens', 'Lente'],
        ['contour', 'Contorno'],
        ['cascade', 'Cascada'],
        ['flat', 'Plana'],
      ],
    },
    { key: 'glassDistortion', label: 'distorsión', value: 0.88, min: -1, max: 1, step: 0.01, dependsOn: 'glassOn' },
    { key: 'glassShift', label: 'desplazar', value: -0.36, min: -1, max: 1, step: 0.01, dependsOn: 'glassOn' },
    { key: 'glassStretch', label: 'estirar', value: 0.43, min: 0, max: 1, step: 0.01, dependsOn: 'glassOn' },
]

export const glassGLSL = /* glsl */ `
// --- Vidrio acanalado ---
uniform float uGlassOn;
uniform int   uGlassShape;      // 0 líneas, 1 irregulares, 2 onda, 3 zigzag, 4 patrón
uniform int   uGlassDistShape;  // 0 prisma, 1 lente, 2 contorno, 3 cascada, 4 plana
uniform float uGlassSize;
uniform float uGlassAngle;
uniform float uGlassDistortion;
uniform float uGlassShift;
uniform float uGlassStretch;
uniform float uGlassShadows;
uniform float uGlassHighlights;
uniform float uGlassCurve;      // curvatura del perfil (1 = sin cambio)
uniform float uGlassIrregular;  // variación aleatoria por estría
uniform float uGlassSlide;      // escalonado: desplaza la imagen a lo largo de cada estría

float glassHash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// Perfil de desplazamiento dentro de una estría (t en -1..1, f en 0..1), en anchos de estría
float glassProfile(float t, float f) {
  if (uGlassDistShape == 0) return t;                          // prisma: rampa lineal
  if (uGlassDistShape == 1) return -t * (1.0 - 0.5 * t * t);   // lente: amplía el centro
  if (uGlassDistShape == 2) return sin(t * 3.14159);           // contorno
  if (uGlassDistShape == 3) return fract(f * 2.0) * 2.0 - 1.0; // cascada: dos rampas por estría
  return 0.0;                                                  // plana: solo sombras y brillos
}

// Sombra en la cara que cae y brillo fino en el borde de entrada de cada estría
void glassLight(float f, inout float shade, inout float hl) {
  shade = max(shade, uGlassShadows * 0.75 * smoothstep(0.25, 1.0, f));
  hl += uGlassHighlights * (0.55 * exp(-f * f / 0.0025) + 0.22 * exp(-pow((f - 0.12) / 0.08, 2.0)));
}

// Devuelve el punto de la imagen que se ve a través del vidrio en p.
// k escala la refracción: con k distinto por canal se obtiene aberración cromática.
vec2 glassWarpK(vec2 p, float k, out float shade, out float hl) {
  shade = 0.0;
  hl = 0.0;
  if (uGlassOn < 0.5) return p;

  float w = 0.02 + uGlassSize * uGlassSize * 0.2;   // ancho de estría (en altos de imagen)
  vec2 r = rot(-uGlassAngle) * p;
  float u = r.x;
  if (uGlassShape == 1) u += w * (0.35 * sin(u / w * 0.61 + 1.3) + 0.2 * sin(u / w * 1.37));
  else if (uGlassShape == 2) u += w * 0.6 * sin(r.y / w * 1.2);
  else if (uGlassShape == 3) u += w * 0.6 * (abs(fract(r.y / (w * 3.0)) * 2.0 - 1.0) * 2.0 - 1.0);

  vec2 cell = vec2(u, r.y) / w;
  vec2 f = fract(cell);
  vec2 t = f * 2.0 - 1.0;
  t = sign(t) * pow(abs(t), vec2(uGlassCurve));

  // Irregularidad: cada estría refracta y se desplaza un poco distinto
  float id = floor(cell.x);
  float h1 = glassHash(id) * 2.0 - 1.0;
  float h2 = glassHash(id + 71.3) - 0.5;
  float strength = uGlassDistortion * (1.0 + uGlassIrregular * h1) * k;

  vec2 d = vec2(glassProfile(t.x, f.x), uGlassShape == 4 ? glassProfile(t.y, f.y) : 0.0);
  vec2 off = (d * strength + vec2(uGlassShift, 0.0)) * w;
  off.y += ((f.x - 0.5) * uGlassSlide * (1.0 + uGlassIrregular * h1) + uGlassIrregular * h2 * 0.08) * k;

  glassLight(f.x, shade, hl);
  if (uGlassShape == 4) glassLight(f.y, shade, hl);

  // Estirar alarga la tela a lo largo de las estrías
  vec2 q = vec2(r.x + off.x, (r.y + off.y) / (1.0 + uGlassStretch * 2.0));
  return rot(uGlassAngle) * q;
}

vec2 glassWarp(vec2 p, out float shade, out float hl) {
  return glassWarpK(p, 1.0, shade, hl);
}

// Versión para color: las sombras oscurecen y los brillos se escalan con la luminancia
// de lo que hay detrás, para no dibujar líneas sobre negro puro
vec3 glassApply(vec3 col, float shade, float hl) {
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  return col * (1.0 - shade) + hl * (0.15 + 0.85 * clamp(l * 1.5, 0.0, 1.0));
}
`

export const glassUniforms = () => ({
  uGlassOn: { value: 0 },
  uGlassShape: { value: 0 },
  uGlassDistShape: { value: 0 },
  uGlassSize: { value: 0.5 },
  uGlassAngle: { value: 0 },
  uGlassDistortion: { value: 0 },
  uGlassShift: { value: 0 },
  uGlassStretch: { value: 0 },
  uGlassShadows: { value: 0 },
  uGlassHighlights: { value: 0 },
  uGlassCurve: { value: 1 },
  uGlassIrregular: { value: 0 },
  uGlassSlide: { value: 0 },
})

export function applyGlass(u, p) {
  u.uGlassOn.value = p.glassOn ? 1 : 0
  u.uGlassShape.value = SHAPES.indexOf(p.glassShape)
  u.uGlassDistShape.value = DIST_SHAPES.indexOf(p.glassDistShape)
  u.uGlassSize.value = p.glassSize
  u.uGlassAngle.value = p.glassAngle * DEG
  u.uGlassDistortion.value = p.glassDistortion
  u.uGlassShift.value = p.glassShift
  u.uGlassStretch.value = p.glassStretch
  u.uGlassShadows.value = p.glassShadows
  u.uGlassHighlights.value = p.glassHighlights
  u.uGlassCurve.value = p.glassCurve ?? 1
  u.uGlassIrregular.value = p.glassIrregular ?? 0
  u.uGlassSlide.value = p.glassSlide ?? 0
}
