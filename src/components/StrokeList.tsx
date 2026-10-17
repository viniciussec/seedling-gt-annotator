import { useEffect, useMemo, useRef } from 'react'
import type { Stroke } from '../types'
import { organColor, organLabel } from '../types'
import { chainLength } from '../lib/geometry'

interface Props {
  strokes: Stroke[]
  selectedIds: string[]
  /** Clique numa linha: seleciona só ela; com Ctrl/⌘/Shift, alterna na seleção. */
  onSelect: (id: string, additive: boolean) => void
  onSelectIds: (ids: string[]) => void
  onDelete: (id: string) => void
  onChangeSeedling: (id: string, seedlingId: number | null) => void
}

const NONE = '__none__' // valor do <option> para traços sem ID

export default function StrokeList({ strokes, selectedIds, onSelect, onSelectIds, onDelete, onChangeSeedling }: Props) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const listRef = useRef<HTMLUListElement>(null)

  const sorted = useMemo(
    () =>
      [...strokes].sort(
        (a, b) => (a.seedling_id ?? Infinity) - (b.seedling_id ?? Infinity) || a.organ.localeCompare(b.organ),
      ),
    [strokes],
  )

  // IDs existentes e quantos traços cada um tem
  const idOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of strokes) {
      const k = s.seedling_id === null ? NONE : String(s.seedling_id)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort(([a], [b]) => (a === NONE ? Infinity : Number(a)) - (b === NONE ? Infinity : Number(b)))
  }, [strokes])

  const strokesOf = (key: string) =>
    strokes.filter((s) => (key === NONE ? s.seedling_id === null : s.seedling_id === Number(key))).map((s) => s.id)

  // O select reflete a seleção: mostra um ID quando a seleção é exatamente "todos os traços daquele ID".
  const selectValue = useMemo(() => {
    if (selectedIds.length === 0) return ''
    for (const [key] of idOptions) {
      const ids = strokesOf(key)
      if (ids.length === selectedIds.length && ids.every((id) => selected.has(id))) return key
    }
    return ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, strokes, idOptions])

  // Ao selecionar (na imagem ou pelo ID), traz o primeiro selecionado para a vista da lista.
  useEffect(() => {
    if (selectedIds.length === 0) return
    listRef.current?.querySelector('li.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedIds])

  return (
    <>
      <label className="row" title="Seleciona (e destaca na imagem) todos os traços com o ID escolhido">
        <span>Destacar plântula</span>
        <select
          value={selectValue}
          disabled={idOptions.length === 0}
          onChange={(e) => onSelectIds(e.target.value === '' ? [] : strokesOf(e.target.value))}
        >
          <option value="">— nenhuma —</option>
          {idOptions.map(([key, n]) => (
            <option key={key} value={key}>
              {key === NONE ? 'Sem ID' : `ID ${key}`} ({n} {n === 1 ? 'traço' : 'traços'})
            </option>
          ))}
        </select>
      </label>

      {strokes.length === 0 ? (
        <p className="muted">Nenhum traço ainda.</p>
      ) : (
        <ul className="stroke-list" ref={listRef}>
          {sorted.map((s) => (
            <li
              key={s.id}
              className={selected.has(s.id) ? 'selected' : ''}
              onClick={(e) => onSelect(s.id, e.ctrlKey || e.metaKey || e.shiftKey)}
            >
              <span className="swatch" style={{ background: organColor(s.organ) }} />
              <span className="grow">
                {organLabel(s.organ)}
                <small className="muted">
                  {' '}
                  · {s.pixels.length} px · comp. {chainLength(s.pixels).toFixed(1)}
                </small>
              </span>
              <input
                type="number"
                min={0}
                title="ID da plântula"
                placeholder="id"
                value={s.seedling_id ?? ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onChangeSeedling(s.id, e.target.value === '' ? null : Number(e.target.value))}
              />
              <button
                className="icon"
                title="Excluir traço"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(s.id)
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
