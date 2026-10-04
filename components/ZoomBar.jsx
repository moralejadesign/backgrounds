import s from './ZoomBar.module.css'

function Playback({ playing, onToggle, onScrub, progressRef, timeLabelRef }) {
  return (
    <>
      <button
        type="button"
        className={`${s.btn} ${s.play}`}
        onClick={onToggle}
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
      <span className={s.sep} aria-hidden="true" />
    </>
  )
}

export default function ZoomBar({ scale, fitted, onZoomIn, onZoomOut, onFit, onActualSize, playback }) {
  return (
    <div className={`zoomBar ${s.bar}`} role="toolbar" aria-label="Vista">
      {playback && <Playback {...playback} />}
      <button type="button" className={s.btn} onClick={onZoomOut} aria-label="Alejar" title="Alejar (−)">
        −
      </button>
      <span className={s.value} aria-live="polite">
        {Math.round(scale * 100)}%
      </span>
      <button type="button" className={s.btn} onClick={onZoomIn} aria-label="Acercar" title="Acercar (+)">
        +
      </button>
      <span className={s.sep} aria-hidden="true" />
      <button
        type="button"
        className={`${s.btn} ${s.text} ${fitted ? s.active : ''}`}
        onClick={onFit}
        title="Ajustar a la pantalla (0)"
      >
        Ajustar
      </button>
      <button
        type="button"
        className={`${s.btn} ${s.text} ${Math.abs(scale - 1) < 1e-6 ? s.active : ''}`}
        onClick={onActualSize}
        title="Tamaño real (1)"
      >
        1:1
      </button>
    </div>
  )
}
