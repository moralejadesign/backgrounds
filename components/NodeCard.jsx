'use client'

import { useRef, useState } from 'react'
import { ParamControls } from './fields'
import { HEADER_H, nodeWidth, previewHeight } from '@/lib/nodes/graph'
import s from './NodeCard.module.css'

// Tarjeta de un nodo. El área de preview es transparente: el lienzo WebGL de fondo dibuja
// ahí la textura del nodo (ver Editor). Los puertos se colocan con la misma geometría que
// usan los cables (lib/nodes/graph.js).
export default function NodeCard({
  node,
  def,
  aspect,
  selected,
  connectedInputs,
  connecting,
  imageName,
  onSelect,
  onHeaderDown,
  onToggleBypass,
  onDelete,
  onParam,
  onOutDown,
  onInDown,
  onFile,
  headerExtra,
  children,
}) {
  const [tab, setTab] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const fileRef = useRef(null)
  const width = nodeWidth(node)
  const ph = previewHeight(node, aspect)
  const groups = def.groups
  const group = groups[Math.min(tab, groups.length - 1)]
  const isOutput = node.type === 'output'

  return (
    <div
      className={`${s.card} ${selected ? s.selected : ''} ${node.bypass ? s.bypassed : ''}`}
      style={{ left: node.x, top: node.y, width }}
      onPointerDown={() => onSelect(node.id)}
    >
      <header className={s.header} style={{ height: HEADER_H }} onPointerDown={(e) => onHeaderDown(e, node.id)}>
        <span className={s.grip} aria-hidden="true" />
        <span className={s.title}>{def.title}</span>
        {headerExtra}
        {!isOutput && (
          <>
            <button
              type="button"
              className={`${s.iconBtn} ${s.bypass}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onToggleBypass(node.id)}
              aria-pressed={!node.bypass}
              title={node.bypass ? 'Activar nodo' : 'Desactivar nodo (deja pasar la imagen)'}
            >
              <span className={s.dot} />
            </button>
            <button
              type="button"
              className={s.iconBtn}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete(node.id)}
              aria-label={`Eliminar ${def.title}`}
              title="Eliminar nodo"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </button>
          </>
        )}
      </header>

      <div className={s.preview} style={{ height: ph }} data-preview={node.id} />

      {children ?? (
        <div className={s.body}>
          {def.hasFile && (
            <div className={s.fileRow}>
              <button type="button" className={s.fileBtn} onClick={() => fileRef.current?.click()}>
                {imageName ? 'Cambiar imagen' : 'Elegir imagen'}
              </button>
              <span className={s.fileName}>{imageName ?? (node.params.imageName ? `${node.params.imageName} (vuelve a elegirla)` : 'Ninguna')}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => e.target.files?.[0] && onFile(node.id, e.target.files[0])}
              />
            </div>
          )}
          {groups.length > 0 && (
            <>
              <div className={s.optionsHead}>
                {groups.length > 1 ? (
                  <div className={s.tabs} role="tablist">
                    {groups.map((g, i) => (
                      <button
                        key={g.id}
                        type="button"
                        role="tab"
                        aria-selected={i === tab}
                        className={`${s.tab} ${i === tab ? s.tabActive : ''}`}
                        onClick={() => {
                          setTab(i)
                          setCollapsed(false)
                        }}
                      >
                        {g.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={s.optionsTitle}>Opciones</span>
                )}
                <button
                  type="button"
                  className={s.collapse}
                  onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapsed ? 'Mostrar opciones' : 'Ocultar opciones'}
                >
                  <svg className={collapsed ? '' : s.open} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              {!collapsed && (
                <div className={s.controls}>
                  <ParamControls controls={group.controls} params={node.params} onChange={(k, v) => onParam(node.id, k, v)} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Puertos */}
      {def.inputs.map((port, i) => {
        const spread = def.inputs.length > 1 ? (i - (def.inputs.length - 1) / 2) * 44 : 0
        return (
          <span
            key={port}
            className={`${s.port} ${s.portIn} ${connectedInputs.has(port) ? s.portOn : ''} ${connecting ? s.portTarget : ''}`}
            style={{ top: HEADER_H + ph / 2 + spread }}
            data-port-in=""
            data-node={node.id}
            data-port={port}
            onPointerDown={(e) => onInDown(e, node.id, port)}
            title={def.inputs.length > 1 ? `Entrada ${port.toUpperCase()}` : 'Entrada'}
          >
            {def.inputs.length > 1 && <span className={s.portLabel}>{port.toUpperCase()}</span>}
          </span>
        )
      })}
      {!isOutput && (
        <span
          className={`${s.port} ${s.portOut}`}
          style={{ top: HEADER_H + ph / 2 }}
          onPointerDown={(e) => onOutDown(e, node.id)}
          title="Salida: arrastra hasta la entrada de otro nodo"
        />
      )}
    </div>
  )
}
