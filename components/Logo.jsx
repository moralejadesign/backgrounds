// Marca de Croma: el SVG original de la marca (public/croma-icon.svg), sin modificar.
// El archivo trae 6 px de margen transparente alrededor del azulejo (141 × 141, azulejo de 130).
export default function Logo({ className, size = 28 }) {
  return <img className={className} src="/croma-icon.svg" width={size} height={size} alt="" aria-hidden="true" />
}
