import type { Organ, Tool } from '../types'
import { ORGANS } from '../types'

interface Props {
  tool: Tool
  setTool: (t: Tool) => void
  organ: Organ
  setOrgan: (o: Organ) => void
  simplifyTol: number
  setSimplifyTol: (v: number) => void
  seedlingId: number | null
  setSeedlingId: (n: number | null) => void
  labelOpacity: number
  setLabelOpacity: (v: number) => void
  minVisible: boolean
  setMinVisible: (v: boolean) => void
  hasBase: boolean
  hasLabel: boolean
  canUndo: boolean
  canRedo: boolean
  canExport: boolean
  onUndo: () => void
  onRedo: () => void
  onZoom: (factor: number) => void
  onFit: () => void
  onActualSize: () => void
  onPickBase: (f: File) => void
  onPickLabel: (f: File) => void
  onImportGt: (f: File) => void
  onExport: () => void
}

const TOOLS: { key: Tool; label: string; hotkey: string }[] = [
  { key: 'freehand', label: 'Mão livre', hotkey: 'H' },
  { key: 'draw', label: 'Pontos', hotkey: 'D' },
  { key: 'select', label: 'Editar', hotkey: 'S' },
  { key: 'pan', label: 'Mover', hotkey: 'M' },
]

function FilePick({ label, accept, onPick }: { label: string; accept: string; onPick: (f: File) => void }) {
  return (
    <label className="file-btn">
      {label}
      <input
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = '' // permite reabrir o mesmo arquivo
        }}
      />
    </label>
  )
}

export default function Toolbar(p: Props) {
  return (
    <div className="toolbar">
      <section>
        <h3>Arquivos</h3>
        <div className="row wrap">
          <FilePick label="Imagem original" accept="image/*" onPick={p.onPickBase} />
          <FilePick label="Máscara (label)" accept="image/*" onPick={p.onPickLabel} />
          <FilePick label="Importar GT" accept="application/json,.json" onPick={p.onImportGt} />
          <button disabled={!p.canExport} onClick={p.onExport}>
            Exportar GT
          </button>
        </div>
        {p.hasBase && p.hasLabel && (
          <label className="row">
            <span>Opacidade da máscara</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={p.labelOpacity}
              onChange={(e) => p.setLabelOpacity(Number(e.target.value))}
            />
          </label>
        )}
      </section>

      <section>
        <h3>Ferramenta</h3>
        <div className="row">
          {TOOLS.map((t) => (
            <button key={t.key} className={p.tool === t.key ? 'active' : ''} onClick={() => p.setTool(t.key)}>
              {t.label} <kbd>{t.hotkey}</kbd>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Novo traço</h3>
        <div className="row">
          {ORGANS.map((o) => (
            <button
              key={o.key}
              className={p.organ === o.key ? 'active' : ''}
              style={{ borderColor: o.color }}
              onClick={() => p.setOrgan(o.key)}
            >
              <span className="swatch" style={{ background: o.color }} /> {o.label} <kbd>{o.hotkey}</kbd>
            </button>
          ))}
        </div>
        <label className="row" title="Tolerância da simplificação do traço à mão livre, em pixels da imagem. 0 mantém todos os pontos.">
          <span>Simplificação (px)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={p.simplifyTol}
            onChange={(e) => p.setSimplifyTol(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="row">
          <span>ID da plântula</span>
          <input
            type="number"
            min={0}
            value={p.seedlingId ?? ''}
            onChange={(e) => p.setSeedlingId(e.target.value === '' ? null : Number(e.target.value))}
          />
          <button onClick={() => p.setSeedlingId((p.seedlingId ?? 0) + 1)} title="Próxima plântula">
            +1
          </button>
        </label>
      </section>

      <section>
        <h3>Visualização</h3>
        <div className="row wrap">
          <button onClick={() => p.onZoom(1.25)}>＋</button>
          <button onClick={() => p.onZoom(0.8)}>－</button>
          <button onClick={p.onFit}>Ajustar</button>
          <button onClick={p.onActualSize}>100%</button>
          <button disabled={!p.canUndo} onClick={p.onUndo}>
            Desfazer
          </button>
          <button disabled={!p.canRedo} onClick={p.onRedo}>
            Refazer
          </button>
        </div>
        <label className="row check">
          <input type="checkbox" checked={p.minVisible} onChange={(e) => p.setMinVisible(e.target.checked)} />
          <span>Linha visível em zoom baixo (só visual)</span>
        </label>
        <p className="muted small">
          O traço é desenhado com 1 pixel da imagem; abaixo de 100% de zoom ele fica mais fino que um pixel de tela.
        </p>
        <p className="muted small">
          Roda do mouse: zoom · Arrastar com <kbd>Espaço</kbd>, botão do meio ou ferramenta Mover: mover a imagem.
        </p>
      </section>
    </div>
  )
}
