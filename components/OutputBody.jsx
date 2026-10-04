'use client'

import { FormatPicker, Slider, SelectField } from './fields'
import { formats } from '@/lib/formats'
import s from './OutputBody.module.css'

// Cuerpo del nodo de salida: formato, línea de tiempo global y exportación
export default function OutputBody({
  output,
  onOutput,
  playing,
  onTogglePlay,
  onScrub,
  progressRef,
  timeLabelRef,
  onExportPNG,
  onExportMP4,
  exportProgress,
  videoSupported,
}) {
  const busy = exportProgress !== null
  return (
    <div className={s.body}>
      <FormatPicker formats={formats} value={output.formatId} onChange={(id) => onOutput({ formatId: id })} />

      <div className={s.playback}>
        <button
          type="button"
          className={s.play}
          onClick={onTogglePlay}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          title={playing ? 'Pausar (espacio)' : 'Reproducir (espacio)'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
          </svg>
        </button>
        <input
          ref={progressRef}
          className={s.timeline}
          type="range"
          min="0"
          max="1000"
          step="1"
          defaultValue="0"
          onInput={(e) => onScrub(Number(e.target.value) / 1000)}
          aria-label="Posición en el loop"
        />
        <span ref={timeLabelRef} className={s.time} />
      </div>

      <div className={s.fields}>
        <Slider
          label="duración"
          min={2}
          max={20}
          step={0.5}
          unit="s"
          value={output.duration}
          onChange={(v) => onOutput({ duration: v })}
        />
        <SelectField
          label="fps video"
          value={output.fps}
          options={[
            ['30', '30 fps'],
            ['60', '60 fps'],
          ]}
          onChange={(v) => onOutput({ fps: v })}
        />
      </div>

      <div className={s.exports}>
        <button
          type="button"
          className={`${s.primary} ${busy ? s.busy : ''}`}
          style={{ '--progress': exportProgress ?? 0 }}
          onClick={onExportMP4}
          disabled={busy || !videoSupported}
          title={videoSupported ? undefined : 'Este navegador no soporta exportar video (WebCodecs)'}
        >
          {busy ? `Renderizando ${Math.round(exportProgress * 100)}%` : 'Exportar MP4'}
        </button>
        <button type="button" className={s.secondary} onClick={onExportPNG} disabled={busy}>
          PNG
        </button>
      </div>
    </div>
  )
}
