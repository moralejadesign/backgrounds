'use client'

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import s from './ColorPicker.module.css'

// --- Conversión de color ---------------------------------------------------

interface Rgb {
  r: number
  g: number
  b: number
}
interface Hsv {
  h: number
  s: number
  v: number
}
type ColorMode = 'hex' | 'rgb' | 'hsl'

interface Hsl {
  h: number
  s: number
  l: number
}

// API EyeDropper (Chromium): aún no está en los tipos del DOM
declare global {
  interface Window {
    EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> }
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const rgbToHex = ({ r, g, b }: Rgb) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

function rgbToHsv({ r, g, b }: Rgb): Hsv {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 }
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  const { h } = rgbToHsv({ r: r * 255, g: g * 255, b: b * 255 })
  return { h, s, l }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 }
}

// --- Colores guardados (compartidos por todos los selectores) --------------

const SAVED_KEY = 'croma-saved-colors'
const DEFAULT_SAVED = ['#4ea35a', '#3d6ee8', '#4b45d8', '#8a3fe0', '#b93ad1', '#d03f7d', '#cf3c35', '#e0682b', '#f6e9dc', '#0a0a0a']

function readSaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null')
    return Array.isArray(v) ? v : DEFAULT_SAVED
  } catch {
    return DEFAULT_SAVED
  }
}
function writeSaved(list: string[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list))
  } catch {}
}

// --- Arrastre con captura de puntero ---------------------------------------

function usePointerArea(onPick: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const pick = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    onPick(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1))
  }
  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    ref.current!.setPointerCapture(e.pointerId)
    pick(e)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (ref.current!.hasPointerCapture(e.pointerId)) pick(e)
  }
  return { ref, onPointerDown, onPointerMove }
}

// --- Selector --------------------------------------------------------------

const POPOVER_W = 288
const POPOVER_H = 470

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  label: string
}

export default function ColorPicker({ value, onChange, anchorRef, onClose, label }: ColorPickerProps) {
  const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 }
  // El tono se guarda aparte: en grises (saturación 0) no se pierde al mover el área
  const [hsv, setHsv] = useState(() => rgbToHsv(rgb))
  const [mode, setMode] = useState<ColorMode>('hex')
  const [hexDraft, setHexDraft] = useState(value.toUpperCase())
  const [saved, setSaved] = useState(DEFAULT_SAVED)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => setSaved(readSaved()), [])

  // Sincroniza con cambios externos (otro selector, restablecer…) sin perder el tono
  useEffect(() => {
    setHexDraft(value.toUpperCase())
    const current = rgbToHex(hsvToRgb(hsv)).toLowerCase()
    if (current !== value.toLowerCase()) {
      const next = rgbToHsv(rgb)
      setHsv((prev) => ({ ...next, h: next.s === 0 || next.v === 0 ? prev.h : next.h }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emitHsv = (next: Hsv) => {
    setHsv(next)
    onChange(rgbToHex(hsvToRgb(next)))
  }
  const emitHex = (hex: string) => {
    const c = hexToRgb(hex)
    if (!c) return
    const next = rgbToHsv(c)
    setHsv((prev) => ({ ...next, h: next.s === 0 || next.v === 0 ? prev.h : next.h }))
    onChange(rgbToHex(c))
  }

  const area = usePointerArea((x, y) => emitHsv({ ...hsv, s: x, v: 1 - y }))
  const hue = usePointerArea((x) => emitHsv({ ...hsv, h: x * 360 }))

  // Posición: debajo del muestrario, o encima si no cabe; siempre dentro de la ventana
  useLayoutEffect(() => {
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect()
      if (!r) return
      const left = clamp(r.right - POPOVER_W, 12, window.innerWidth - POPOVER_W - 12)
      const below = r.bottom + 10
      const top = below + POPOVER_H < window.innerHeight ? below : Math.max(12, r.top - 10 - POPOVER_H)
      setPos({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorRef])

  // Cerrar con clic fuera o Escape
  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      const target = e.target as Node
      if (popRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose, anchorRef])

  const canEyedrop = typeof window !== 'undefined' && 'EyeDropper' in window
  const eyedrop = async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      emitHex(sRGBHex)
    } catch {
      // El usuario canceló con Escape
    }
  }

  const addSaved = () => {
    const hex = value.toLowerCase()
    const list = [hex, ...saved.filter((c) => c.toLowerCase() !== hex)].slice(0, 20)
    setSaved(list)
    writeSaved(list)
  }
  const removeSaved = (hex: string) => {
    const list = saved.filter((c) => c !== hex)
    setSaved(list)
    writeSaved(list)
  }

  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))
  const hsl = rgbToHsl(rgb)
  const setRgbPart = (k: keyof Rgb, v: string) => emitHex(rgbToHex({ ...rgb, [k]: clamp(Number(v) || 0, 0, 255) }))
  const setHslPart = (k: keyof Hsl, v: string) => {
    const max = k === 'h' ? 360 : 100
    const next = { ...hsl, [k]: clamp(Number(v) || 0, 0, max) / (k === 'h' ? 1 : 100) }
    emitHex(rgbToHex(hslToRgb(next)))
  }

  if (!pos) return null
  return createPortal(
    <div
      ref={popRef}
      className={s.popover}
      style={{ left: pos.left, top: pos.top, width: POPOVER_W }}
      role="dialog"
      aria-label={`Elegir ${label}`}
    >
      {/* Saturación (x) y brillo (y) */}
      <div
        {...area}
        className={s.area}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        role="slider"
        aria-label="Saturación y brillo"
        aria-valuetext={`${Math.round(hsv.s * 100)}% de saturación, ${Math.round(hsv.v * 100)}% de brillo`}
      >
        <span className={s.areaThumb} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
      </div>

      <div className={s.row}>
        <button
          type="button"
          className={s.eyedropper}
          onClick={eyedrop}
          disabled={!canEyedrop}
          title={canEyedrop ? 'Tomar un color de la pantalla' : 'Este navegador no permite tomar colores de la pantalla'}
          aria-label="Cuentagotas"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 5.5l4 4M17 3.5a2.1 2.1 0 013 3L9 17.5 5 19l1.5-4z" />
          </svg>
        </button>
        <div {...hue} className={s.hue} role="slider" aria-label="Tono" aria-valuenow={Math.round(hsv.h)} aria-valuemin={0} aria-valuemax={360}>
          <span className={s.hueThumb} style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }} />
        </div>
      </div>

      <div className={s.row}>
        <span className={s.modeWrap}>
          <select className={s.mode} value={mode} onChange={(e) => setMode(e.target.value as ColorMode)} aria-label="Formato del color">
            <option value="hex">Hex</option>
            <option value="rgb">RGB</option>
            <option value="hsl">HSL</option>
          </select>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
        <div className={s.inputs}>
          <span className={s.dot} style={{ background: value }} />
          {mode === 'hex' && (
            <input
              className={s.text}
              value={hexDraft}
              spellCheck={false}
              aria-label="Hex"
              onChange={(e) => {
                const v = e.target.value.toUpperCase()
                setHexDraft(v)
                if (/^#?[0-9A-F]{6}$/.test(v)) emitHex(v.startsWith('#') ? v : `#${v}`)
              }}
              onBlur={() => setHexDraft(value.toUpperCase())}
            />
          )}
          {mode === 'rgb' &&
            (['r', 'g', 'b'] as const).map((k) => (
              <input
                key={k}
                className={s.num}
                type="number"
                min="0"
                max="255"
                value={Math.round(rgb[k])}
                onChange={(e) => setRgbPart(k, e.target.value)}
                aria-label={k.toUpperCase()}
              />
            ))}
          {mode === 'hsl' &&
            (
              [
                ['h', Math.round(hsl.h), 360],
                ['s', Math.round(hsl.s * 100), 100],
                ['l', Math.round(hsl.l * 100), 100],
              ] as const
            ).map(([k, v, max]) => (
              <input
                key={k}
                className={s.num}
                type="number"
                min="0"
                max={max}
                value={v}
                onChange={(e) => setHslPart(k, e.target.value)}
                aria-label={k.toUpperCase()}
              />
            ))}
        </div>
      </div>

      <div className={s.savedHead}>
        <span>Guardados</span>
        <button type="button" className={s.add} onClick={addSaved} title="Guardar el color actual">
          + Agregar
        </button>
      </div>
      <div className={s.saved}>
        {saved.map((c) => (
          <button
            key={c}
            type="button"
            className={`${s.swatch} ${c.toLowerCase() === value.toLowerCase() ? s.swatchOn : ''}`}
            style={{ background: c }}
            onClick={() => emitHex(c)}
            onContextMenu={(e) => {
              e.preventDefault()
              removeSaved(c)
            }}
            title={`${c.toUpperCase()} · clic derecho para quitar`}
            aria-label={c}
          />
        ))}
      </div>
    </div>,
    document.body,
  )
}
