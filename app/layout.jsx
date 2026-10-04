import { Inter, Inter_Tight } from 'next/font/google'
import './globals.css'

const display = Inter_Tight({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' })
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })

export const metadata = {
  title: 'Croma Backgrounds',
  description: 'Generador de fondos abstractos con shaders GLSL',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
