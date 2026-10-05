'use client'

import { useEffect, useState } from 'react'
import Logo from './Logo'
import { NODE_TYPES, LIBRARY } from '@/lib/nodes'
import s from './Library.module.css'

// Glifo pequeño por categoría
const GLYPHS = {
  source: <circle cx="12" cy="12" r="6" />,
  effect: <path d="M5 19V5m4.7 14V5m4.6 14V5M19 19V5" />,
  filter: <path d="M5 6h14l-5 6.5V18l-4 1.5v-7z" />,
  motion: <path d="M4 12c3-6 5-6 8 0s5 6 8 0" />,
  ascii: <path d="M10 4L8 20M16 4l-2 16M4.5 9h15M4 15h15" />,
  combine: (
    <>
      <circle cx="9" cy="12" r="5" />
      <circle cx="15" cy="12" r="5" />
    </>
  ),
}

export default function Library({ collapsed, onToggle, onAdd, onFit, onReset, onHelp }) {
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    if (!confirmReset) return
    const t = setTimeout(() => setConfirmReset(false), 3000)
    return () => clearTimeout(t)
  }, [confirmReset])

  return (
    <aside className={`${s.panel} ${collapsed ? s.collapsed : ''}`} data-tour="library">
      <div className={s.brand}>
        <Logo className={s.logo} />
        <span className={s.name}>Croma Backgrounds</span>
        {/* En móvil, la barra inferior muestra "Añadir capa" en lugar de la flecha */}
        <button type="button" className={s.addLayer} onClick={onToggle} aria-expanded={!collapsed}>
          {collapsed ? '+ Añadir capa' : 'Cerrar'}
        </button>
        <button
          type="button"
          className={s.toggle}
          onClick={onToggle}
          aria-label={collapsed ? 'Mostrar biblioteca' : 'Ocultar biblioteca'}
          title={collapsed ? 'Mostrar biblioteca' : 'Ocultar biblioteca'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          <p className={s.hint}>Toca o haz clic para añadir antes de la salida, o arrastra al lienzo.</p>
          <div className={s.list}>
            {LIBRARY.map((section) => (
              <section key={section.title} className={s.section}>
                <h2 className={s.sectionTitle}>{section.title}</h2>
                {section.types.map((type) => {
                  const def = NODE_TYPES[type]
                  return (
                    <button
                      key={type}
                      type="button"
                      className={s.item}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-croma-node', type)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => onAdd(type)}
                    >
                      <span className={s.glyph}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          {GLYPHS[def.glyph] ?? GLYPHS[def.category]}
                        </svg>
                      </span>
                      <span className={s.itemText}>
                        <span className={s.itemTitle}>{def.title}</span>
                        <span className={s.itemDesc}>{def.description}</span>
                      </span>
                      <span className={s.plus} aria-hidden="true">
                        +
                      </span>
                    </button>
                  )
                })}
              </section>
            ))}
          </div>
          <div className={s.footer}>
            <button type="button" className={`${s.footerBtn} ${s.help}`} onClick={onHelp} aria-label="Guía rápida" title="Guía rápida">
              ?
            </button>
            <button type="button" className={s.footerBtn} onClick={onFit} title="Ajustar vista (F)">
              Ajustar vista
            </button>
            <button
              type="button"
              className={`${s.footerBtn} ${confirmReset ? s.danger : ''}`}
              onClick={() => {
                if (confirmReset) {
                  setConfirmReset(false)
                  onReset()
                } else setConfirmReset(true)
              }}
            >
              {confirmReset ? '¿Seguro? Clic otra vez' : 'Lienzo nuevo'}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
