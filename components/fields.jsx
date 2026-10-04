'use client'

import s from './fields.module.css'

function decimals(step) {
  const str = String(step)
  return str.includes('.') ? str.split('.')[1].length : 0
}

// Posición del centro del thumb para una fracción 0..1 del rango
const thumbCenter = (f) => `(${f} * (100% - var(--tw)) + var(--tw) / 2)`

export function Slider({ label, value, min, max, step, unit = '', dimmed, onChange }) {
  const pct = (value - min) / (max - min)
  // Rangos bipolares rellenan desde el cero
  const zero = min < 0 && max > 0 ? -min / (max - min) : 0
  const lo = Math.min(pct, zero)
  const hi = Math.max(pct, zero)
  const left = lo === 0 ? '0px' : `calc${thumbCenter(lo)}`
  const width = `calc(${thumbCenter(hi)} - ${left === '0px' ? '0px' : thumbCenter(lo)})`

  return (
    <label className={`${s.row} ${dimmed ? s.dimmed : ''}`}>
      <span className={s.label}>{label}</span>
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
    </label>
  )
}

export function ColorField({ label, value, dimmed, onChange }) {
  return (
    <label className={`${s.row} ${dimmed ? s.dimmed : ''}`}>
      <span className={s.label}>{label}</span>
      <div className={s.colorValue}>
        <span className={s.hex}>{value.toUpperCase()}</span>
        <span className={s.swatch} style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        </span>
      </div>
    </label>
  )
}

export function ToggleField({ label, value, onChange }) {
  return (
    <label className={s.row}>
      <span className={s.label}>{label}</span>
      <span className={s.toggleWrap}>
        <input
          type="checkbox"
          role="switch"
          className={s.toggle}
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
      </span>
    </label>
  )
}

export function SelectField({ label, value, options, dimmed, onChange }) {
  return (
    <label className={`${s.row} ${dimmed ? s.dimmed : ''}`}>
      <span className={s.label}>{label}</span>
      <span className={s.selectWrap}>
        <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {options.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
        <svg className={s.selectChevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </label>
  )
}

export function FormatPicker({ formats, value, onChange }) {
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
            {active && (
              <svg className={s.check} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Renderiza los controles de un grupo. Un control se atenúa si depende de un interruptor apagado
// (dependsOn) o si solo aplica a otro valor de un selector (activeWhen: [clave, valor]).
export function ParamControls({ controls, params, onChange }) {
  return controls.map((c) => {
    if (c.hidden) return null
    const set = (v) => onChange(c.key, v)
    const off =
      (c.dependsOn ? !params[c.dependsOn] : false) || (c.activeWhen ? params[c.activeWhen[0]] !== c.activeWhen[1] : false)
    switch (c.type) {
      case 'color':
        return (
          <ColorField
            key={c.key}
            label={c.label}
            value={params[c.key]}
            dimmed={off || Number(c.key.slice(-1)) > params.colorCount}
            onChange={set}
          />
        )
      case 'toggle':
        return <ToggleField key={c.key} label={c.label} value={params[c.key]} onChange={set} />
      case 'select':
        return (
          <SelectField key={c.key} label={c.label} value={params[c.key]} options={c.options} dimmed={off} onChange={set} />
        )
      default:
        return (
          <Slider
            key={c.key}
            label={c.label}
            min={c.min}
            max={c.max}
            step={c.step}
            unit={c.unit}
            value={params[c.key]}
            dimmed={off}
            onChange={set}
          />
        )
    }
  })
}
