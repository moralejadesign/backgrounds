'use client'

import { useState } from 'react'
import s from './ControlPanel.module.css'

function decimals(step) {
  const str = String(step)
  return str.includes('.') ? str.split('.')[1].length : 0
}

// Posición del centro del thumb para una fracción 0..1 del rango
const thumbCenter = (f) => `(${f} * (100% - var(--tw)) + var(--tw) / 2)`

function Slider({ label, value, min, max, step, unit = '', onChange }) {
  const pct = (value - min) / (max - min)
  // Rangos bipolares rellenan desde el cero
  const zero = min < 0 && max > 0 ? -min / (max - min) : 0
  const lo = Math.min(pct, zero)
  const hi = Math.max(pct, zero)
  const left = lo === 0 ? '0px' : `calc${thumbCenter(lo)}`
  const width = `calc(${thumbCenter(hi)} - ${left === '0px' ? '0px' : thumbCenter(lo)})`

  return (
    <label className={s.row}>
      <div className={s.track}>
        <div className={s.rail} />
        <div className={s.fill} style={{ left, width }} />
        <div className={s.thumb} style={{ left: `calc(${pct} * (100% - var(--tw)))` }}>
          {value.toFixed(decimals(step))}
          {unit}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
        />
      </div>
      <span className={s.label}>{label}</span>
    </label>
  )
}

function ColorField({ label, value, dimmed, onChange }) {
  return (
    <label className={`${s.row} ${dimmed ? s.dimmed : ''}`}>
      <div className={s.colorValue}>
        <span className={s.swatch} style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        </span>
        <span className={s.hex}>{value.toUpperCase()}</span>
      </div>
      <span className={s.label}>{label}</span>
    </label>
  )
}

function Section({ title, index, children }) {
  const [open, setOpen] = useState(true)
  return (
    <section className={s.group}>
      <button type="button" className={s.header} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={s.headerIndex}>{String(index).padStart(2, '0')}</span>
        <span className={s.headerTitle}>{title}</span>
        <span className={s.toggle} aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className={s.card}>{children}</div>}
    </section>
  )
}

function FormatPicker({ formats, value, onChange }) {
  return (
    <div className={s.formats} role="radiogroup" aria-label="Formato">
      {formats.map((f) => {
        const active = f.id === value
        // Mini rectángulo con la proporción real del formato
        const k = 16 / Math.max(f.w, f.h)
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${f.name} · ${f.w}×${f.h}`}
            className={`${s.format} ${active ? s.formatActive : ''}`}
            onClick={() => onChange(f.id)}
          >
            <span className={s.formatShapeBox}>
              <span className={s.formatShape} style={{ width: f.w * k, height: f.h * k }} />
            </span>
            <span className={s.formatRatio}>{f.ratio}</span>
            <span className={s.formatSize}>
              {f.w}×{f.h}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ParamControls({ controls, params, onChange }) {
  return controls.map((c) =>
    c.type === 'color' ? (
      <ColorField
        key={c.key}
        label={c.label}
        value={params[c.key]}
        dimmed={Number(c.key.slice(-1)) > params.colorCount}
        onChange={(v) => onChange(c.key, v)}
      />
    ) : (
      <Slider
        key={c.key}
        label={c.label}
        min={c.min}
        max={c.max}
        step={c.step}
        unit={c.unit}
        value={params[c.key]}
        onChange={(v) => onChange(c.key, v)}
      />
    ),
  )
}

export default function ControlPanel({
  groups,
  params,
  onChange,
  formats,
  formatId,
  onFormatChange,
  textureZoom,
  onTextureZoomChange,
  onExport,
  exportLabel,
}) {
  return (
    <aside className={s.panel}>
      <Section title="Formato" index={1}>
        <FormatPicker formats={formats} value={formatId} onChange={onFormatChange} />
        <Slider
          label="zoom textura"
          min={0.25}
          max={4}
          step={0.01}
          unit="×"
          value={textureZoom}
          onChange={onTextureZoomChange}
        />
      </Section>
      {groups.map((g, i) => (
        <Section key={g.id} title={g.title} index={i + 2}>
          <ParamControls controls={g.controls} params={params} onChange={onChange} />
        </Section>
      ))}
      <button type="button" className={s.export} onClick={onExport}>
        <span className={s.exportSquare} aria-hidden="true" />
        <span>Exportar</span>
        <span className={s.exportLine} aria-hidden="true" />
        <span>{exportLabel}</span>
        <span className={s.exportFormat}>PNG</span>
      </button>
    </aside>
  )
}
