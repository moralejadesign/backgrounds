import { glass } from './glass'
import { grain } from './grain'

// Cada efecto define: id, name, icon, groups (controles del panel),
// fragmentShader, uniforms() iniciales y apply(uniforms, params)
export const effects = [glass, grain]
