import { Inter_Tight, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const display = Inter_Tight({ subsets: ['latin'], weight: ['800'], variable: '--font-display' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

export const metadata = {
  title: 'Croma Backgrounds',
  description: 'Generador de fondos abstractos con shaders GLSL',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0b',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
