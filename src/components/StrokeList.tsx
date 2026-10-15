import type { Stroke } from '../types'
import { organColor, organLabel } from '../types'
import { chainLength } from '../lib/geometry'

interface Props {
  strokes: Stroke[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onChangeSeedling: (id: string, seedlingId: number | null) => void
}

export default function StrokeList({ strokes, selectedId, onSelect, onDelete, onChangeSeedling }: Props) {
  if (strokes.length === 0) return <p className="muted">Nenhum traço ainda.</p>

  const sorted = [...strokes].sort(
    (a, b) => (a.seedling_id ?? Infinity) - (b.seedling_id ?? Infinity) || a.organ.localeCompare(b.organ),
  )

  return (
    <ul className="stroke-list">
      {sorted.map((s) => (
        <li key={s.id} className={s.id === selectedId ? 'selected' : ''} onClick={() => onSelect(s.id)}>
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
  )
}
