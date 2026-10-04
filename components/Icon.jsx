// Iconos de 24×24 en un solo color (currentColor)
const icons = {
  blend: (
    <>
      <circle cx="9" cy="9" r="6" opacity="0.55" />
      <circle cx="15" cy="15" r="6" />
    </>
  ),
  dots: (
    <>
      {[
        [5, 5], [12, 4], [19, 6], [8, 10], [16, 11], [4, 15], [11, 16], [19, 17], [7, 20], [14, 21],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.9 : 1.4} />
      ))}
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="11" y="1.5" width="2" height="4" rx="1" transform={`rotate(${a} 12 12)`} />
      ))}
    </>
  ),
  flutes: (
    <>
      <rect x="3" y="3" width="3.2" height="18" rx="1.6" />
      <rect x="8.6" y="3" width="3.2" height="18" rx="1.6" />
      <rect x="14.2" y="3" width="3.2" height="18" rx="1.6" />
      <rect x="19.8" y="3" width="1.8" height="18" rx="0.9" opacity="0.5" />
    </>
  ),
  sparkle: <path d="M12 1.5c.6 5.2 3.3 7.9 8.5 8.5v1c-5.2.6-7.9 3.3-8.5 8.5h-1c-.6-5.2-3.3-7.9-8.5-8.5v-1c5.2-.6 7.9-3.3 8.5-8.5h1z" />,
  frame: <path d="M3 7a2 2 0 0 1 2-2h3v2H5v3H3V7zm13-2h3a2 2 0 0 1 2 2v3h-2V7h-3V5zM3 14h2v3h3v2H5a2 2 0 0 1-2-2v-3zm16 0h2v3a2 2 0 0 1-2 2h-3v-2h3v-3z" />,
  download: <path d="M11 3h2v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6V3zM4 19h16v2H4z" />,
  chevron: <path d="M6.4 8.6 12 14.2l5.6-5.6L19 10l-7 7-7-7z" />,
}

export default function Icon({ name, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {icons[name]}
    </svg>
  )
}

