import { useMemo } from 'react'
import type { Stroke } from '../types'
import { ORGANS } from '../types'
import { mergeStrokes } from '../lib/merge'

interface Props {
  strokes: Stroke[]
  selectedIds: string[]
  groupId: number | null
  setGroupId: (n: number | null) => void
  nextFreeId: number
  bridgeGaps: boolean
  setBridgeGaps: (v: boolean) => void
  onGroup: () => void
}

/** Agrupa os traços selecionados sob um mesmo ID e funde os do mesmo órgão em um só. */
export default function GroupPanel({
  strokes,
  selectedIds,
  groupId,
  setGroupId,
  nextFreeId,
  bridgeGaps,
  setBridgeGaps,
  onGroup,
}: Props) {
  const info = useMemo(() => {
    const sel = new Set(selectedIds)
    const selected = strokes.filter((s) => sel.has(s.id))
    // traços FORA da seleção que já usam o ID de destino: entram no grupo
    const outside = groupId === null ? [] : strokes.filter((s) => !sel.has(s.id) && s.seedling_id === groupId)
    const members = [...selected, ...outside]
    const perOrgan = ORGANS.map((o) => {
      const list = members.filter((s) => s.organ === o.key)
      const merge = list.length > 1 ? mergeStrokes(list, groupId, false) : null
      return { key: o.key, label: o.label, n: list.length, gaps: merge?.gaps ?? 0, gapLength: merge?.gapLength ?? 0 }
    })
    const changing = groupId === null ? 0 : selected.filter((s) => s.seedling_id !== groupId).length
    const fusions = perOrgan.reduce((acc, o) => acc + Math.max(0, o.n - 1), 0)
    return { selected: selected.length, outside: outside.length, changing, fusions, perOrgan }
  }, [strokes, selectedIds, groupId])

  const totalGaps = info.perOrgan.reduce((a, o) => a + o.gaps, 0)

  return (
    <div className="group-panel">
      <div className="row">
        <span>Agrupar {info.selected} no ID</span>
        <input
          type="number"
          min={0}
          value={groupId ?? ''}
          onChange={(e) => setGroupId(e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))))}
          onKeyDown={(e) => e.key === 'Enter' && groupId !== null && onGroup()}
        />
        <button title="Usar o próximo ID livre" onClick={() => setGroupId(nextFreeId)}>
          Novo
        </button>
        <button
          className="primary"
          disabled={groupId === null || (info.changing === 0 && info.fusions === 0)}
          onClick={onGroup}
          title="Atribui o ID e funde os traços do mesmo órgão em um só (Ctrl+G)"
        >
          Agrupar
        </button>
      </div>

      {groupId !== null && (
        <>
          <p className="muted small">
            {info.outside > 0 && (
              <b className="warn">
                O ID {groupId} já tem {info.outside} traço(s) fora da seleção; eles entram no grupo.{' '}
              </b>
            )}
            Resultado no ID {groupId}:{' '}
            {info.perOrgan
              .filter((o) => o.n > 0)
              .map((o) => `${o.label} ${o.n > 1 ? `${o.n} → 1` : '1'}`)
              .join(' · ') || 'nenhum traço'}
            .
          </p>
          {totalGaps > 0 && (
            <p className="muted small">
              <b className="warn">
                {info.perOrgan
                  .filter((o) => o.gaps > 0)
                  .map((o) => `${o.label}: ${o.gaps} lacuna(s), ${o.gapLength.toFixed(1)} px`)
                  .join(' · ')}
                .
              </b>{' '}
              Os pedaços não se tocam.
            </p>
          )}
          {totalGaps > 0 && (
            <label className="row check" title="Preenche as lacunas com uma linha reta de pixels. Isso ACRESCENTA pixels que você não desenhou.">
              <input type="checkbox" checked={bridgeGaps} onChange={(e) => setBridgeGaps(e.target.checked)} />
              <span>Ligar as lacunas com linha reta (acrescenta pixels)</span>
            </label>
          )}
        </>
      )}
    </div>
  )
}
