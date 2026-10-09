// Marca de la herramienta: azulejo "CBA" (public/cba-icon.png, 276 × 276, esquinas transparentes).
export default function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return <img className={className} src="/cba-icon.png" width={size} height={size} alt="" aria-hidden="true" />
}
