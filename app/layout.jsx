import { Inter, Inter_Tight } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
// Untitled UI (Tailwind + tema) primero; los estilos propios de la app van después y mandan
import '@/styles/globals.css'
import './globals.css'

// Inter para el texto e Inter Tight para los titulares (incluye 300 y 700: descripciones y títulos)
const display = Inter_Tight({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-inter-tight' })
const sans = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-inter' })

export const metadata = {
  title: 'COOOOL BACKGROUNDS MAKER',
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
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
