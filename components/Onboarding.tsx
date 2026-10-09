'use client'

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import s from './Onboarding.module.css'

// Guía rápida: resalta cada parte real de la interfaz con una tarjeta al lado.
// target = selector del elemento a resaltar (sin target, la tarjeta va centrada).
interface Step {
  title: string
  text: string
  target?: string
  pad?: number
  keys?: string[]
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const STEPS: Step[] = [
  {
    title: 'Bienvenido a COOOOL BACKGROUNDS MAKER',
    text: 'Crea fondos combinando capas. Toda la página es un lienzo: cada tarjeta es una capa y los cables llevan la imagen de una a otra, hasta la salida.',
  },
  {
    target: '[data-tour="library"]',
    title: 'Añade capas',
    text: 'Haz clic en una capa para insertarla justo antes de la salida, o arrástrala al lienzo para colocarla donde quieras.',
  },
  {
    target: '[data-tour="node"]',
    title: 'Cada nodo, en vivo',
    text: 'El preview muestra el resultado de esa capa. Ajusta sus opciones en las pestañas; el punto ● la desactiva sin borrarla y × la elimina.',
  },
  {
    target: '[data-tour="port-out"]',
    pad: 18,
    title: 'Conecta con cables',
    text: 'Arrastra desde este cuadrado hasta la entrada de otro nodo. Pasa sobre un cable y pulsa × para cortarlo. Con «Mezcla» puedes combinar dos ramas.',
  },
  {
    target: '[data-tour="output"]',
    title: 'Salida y exportación',
    text: 'Elige el formato, reproduce la animación y exporta en PNG o MP4 al tamaño real. ⤢ la abre a pantalla completa.',
  },
  {
    title: 'Muévete por el lienzo',
    text: 'Arrastra el fondo o usa la rueda para desplazarte, Ctrl/⌘ + rueda para hacer zoom y F para ajustar la vista. Espacio reproduce o pausa. Tu lienzo se guarda solo.',
    keys: ['Arrastrar', 'Ctrl/⌘ + rueda', 'F', 'Espacio'],
  },
]

const CARD_W = 340
const MARGIN = 16

export default function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const measure = useCallback(() => {
    const el = current.target && document.querySelector(current.target)
    if (!el) return setRect(null)
    const r = el.getBoundingClientRect()
    const pad = current.pad ?? 8
    setRect({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 })
  }, [current])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') last ? onClose() : setStep((v) => v + 1)
      else if (e.key === 'ArrowLeft') setStep((v) => Math.max(0, v - 1))
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, last, onClose])

  if (!open) return null

  // Tarjeta a la derecha del objetivo si cabe; si no, a la izquierda; si no, debajo o arriba.
  // En pantallas estrechas ocupa el ancho y se acopla arriba o abajo, lejos del objetivo.
  const narrow = window.innerWidth < 600
  const width = narrow ? window.innerWidth - 24 : CARD_W
  let cardStyle: CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  if (narrow) {
    const targetLow = rect && rect.y + rect.h / 2 > window.innerHeight / 2
    cardStyle = rect
      ? targetLow
        ? { left: 12, top: 'max(12px, env(safe-area-inset-top))' }
        : { left: 12, bottom: 'max(12px, env(safe-area-inset-bottom))' }
      : { left: 12, top: '50%', transform: 'translateY(-50%)' }
  } else if (rect) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const top = Math.min(Math.max(MARGIN, rect.y), vh - 260)
    if (rect.x + rect.w + MARGIN + CARD_W < vw) cardStyle = { left: rect.x + rect.w + MARGIN, top }
    else if (rect.x - MARGIN - CARD_W > 0) cardStyle = { left: rect.x - MARGIN - CARD_W, top }
    else {
      const left = Math.min(Math.max(MARGIN, rect.x), vw - CARD_W - MARGIN)
      cardStyle = rect.y + rect.h + 240 < vh ? { left, top: rect.y + rect.h + MARGIN } : { left, top: Math.max(MARGIN, rect.y - 240) }
    }
  }

  return (
    <div className={s.root} role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div className={s.spotlight} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      ) : (
        <div className={s.backdrop} />
      )}

      <div className={s.card} style={{ ...cardStyle, width }}>
        <div className={s.meta}>
          <span className={s.count}>
            {step + 1} / {STEPS.length}
          </span>
          <button type="button" className={s.skip} onClick={onClose}>
            Saltar guía
          </button>
        </div>
        <h2 id="tour-title" className={s.title}>
          {current.title}
        </h2>
        <p className={s.text}>{current.text}</p>
        {current.keys && (
          <div className={s.keys}>
            {current.keys.map((k) => (
              <kbd key={k} className={s.key}>
                {k}
              </kbd>
            ))}
          </div>
        )}
        <div className={s.actions}>
          <div className={s.dots} aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`${s.dotStep} ${i === step ? s.dotActive : ''}`} />
            ))}
          </div>
          {step > 0 && (
            <button type="button" className={s.back} onClick={() => setStep(step - 1)}>
              Atrás
            </button>
          )}
          <button type="button" className={s.next} onClick={() => (last ? onClose() : setStep(step + 1))} autoFocus>
            {last ? 'Empezar' : step === 0 ? 'Ver la guía' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
