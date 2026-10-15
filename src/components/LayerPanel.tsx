import { useState } from 'react'
import type { Layer } from '../types'

interface Props {
  layers: Layer[] // de baixo para cima
  refId: string | null
  showStrokes: boolean
  onToggleStrokes: (v: boolean) => void
  onAdd: (files: File[]) => void
  onToggle: (id: string) => void
  onOpacity: (id: string, v: number) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onReorder: (fromId: string, toId: string) => void
  onRemove: (id: string) => void
  onSetRef: (id: string) => void
}

/** Lista de camadas: a de cima da lista é a que fica por cima na imagem. */
export default function LayerPanel(p: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const display = [...p.layers].reverse() // topo primeiro
  const top = p.layers.length - 1

  return (
    <section className="layers">
      <div className="layers-head">
        <h3>Camadas</h3>
        <label className="file-btn">
          ＋ Adicionar imagens
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) p.onAdd(files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      <ul className="layer-list">
        <li className="layer-row strokes-row">
          <input
            type="checkbox"
            title="Mostrar/ocultar os traços do ground truth"
            checked={p.showStrokes}
            onChange={(e) => p.onToggleStrokes(e.target.checked)}
          />
          <span className="grow">Traços (GT) — sempre acima das imagens</span>
        </li>

        {display.map((l) => {
          const idx = p.layers.indexOf(l)
          return (
            <li
              key={l.id}
              className={`layer-row${l.id === overId && dragId !== l.id ? ' drop' : ''}${l.visible ? '' : ' hidden'}`}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                setOverId(l.id)
              }}
              onDragLeave={() => setOverId((o) => (o === l.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && dragId !== l.id) p.onReorder(dragId, l.id)
                setDragId(null)
                setOverId(null)
              }}
            >
              <span
                className="handle"
                title="Arraste para reordenar"
                draggable
                onDragStart={(e) => {
                  setDragId(l.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', l.id)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setOverId(null)
                }}
              >
                ⋮⋮
              </span>
              <input
                type="checkbox"
                title="Mostrar/ocultar a camada"
                checked={l.visible}
                onChange={() => p.onToggle(l.id)}
              />
              <img className="thumb" src={l.url} alt="" draggable={false} />
              <div className="grow meta">
                <div className="name" title={l.name}>
                  {l.name}
                  {l.id === p.refId && <span className="badge">ref</span>}
                </div>
                <label className="opacity">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={l.opacity}
                    onChange={(e) => p.onOpacity(l.id, Number(e.target.value))}
                  />
                  <small>{Math.round(l.opacity * 100)}%</small>
                </label>
              </div>
              <div className="actions">
                <button className="icon" title="Subir" disabled={idx === top} onClick={() => p.onMove(l.id, 'up')}>
                  ▲
                </button>
                <button className="icon" title="Descer" disabled={idx === 0} onClick={() => p.onMove(l.id, 'down')}>
                  ▼
                </button>
                {l.id !== p.refId && (
                  <button className="icon" title="Usar como referência de coordenadas" onClick={() => p.onSetRef(l.id)}>
                    ⌖
                  </button>
                )}
                <button className="icon" title="Remover camada" onClick={() => p.onRemove(l.id)}>
                  ✕
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {p.layers.length === 0 && <p className="muted small">Nenhuma imagem. Adicione a original, a máscara e outras que quiser comparar.</p>}
      {p.layers.length > 1 && (
        <p className="muted small">
          A camada <b>ref</b> define o tamanho e as coordenadas do GT; as demais são ajustadas a ela.
        </p>
      )}
    </section>
  )
}
