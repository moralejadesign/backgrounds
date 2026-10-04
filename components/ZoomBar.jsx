import s from './ZoomBar.module.css'

export default function ZoomBar({ scale, fitted, onZoomIn, onZoomOut, onFit, onActualSize }) {
  return (
    <div className={`zoomBar ${s.bar}`} role="toolbar" aria-label="Zoom de vista">
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
