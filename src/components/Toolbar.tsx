import type { Organ, Tool } from '../types'
import { ORGANS } from '../types'

interface Props {
  tool: Tool
  setTool: (t: Tool) => void
  organ: Organ
  setOrgan: (o: Organ) => void
  autoId: boolean
  setAutoId: (v: boolean) => void
  eraserRadius: number
  setEraserRadius: (v: number) => void
  seedlingId: number | null
  setSeedlingId: (n: number | null) => void
  minVisible: boolean
  setMinVisible: (v: boolean) => void
  canUndo: boolean
  canRedo: boolean
  canExport: boolean
  onUndo: () => void
  onRedo: () => void
  onZoom: (factor: number) => void
  onFit: () => void
  onActualSize: () => void
  onImportGt: (f: File) => void
  onExport: () => void
  onExportMasks: () => void
}

const TOOLS: { key: Tool; label: string; hotkey: string }[] = [
  { key: 'freehand', label: 'Mão livre', hotkey: 'H' },
  { key: 'draw', label: 'Pontos', hotkey: 'D' },
  { key: 'erase', label: 'Borracha', hotkey: 'E' },
  { key: 'select', label: 'Selecionar', hotkey: 'S' },
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
        <h3>Ground truth (JSON)</h3>
        <div className="row wrap">
          <FilePick label="Importar GT" accept="application/json,.json" onPick={p.onImportGt} />
          <button disabled={!p.canExport} onClick={p.onExport}>
            Exportar GT
          </button>
          <button
            disabled={!p.canExport}
            onClick={p.onExportMasks}
            title="Um PNG por órgão (esqueleto = 255, fundo = 0), do tamanho da imagem de referência"
          >
            Exportar máscaras PNG
          </button>
        </div>
      </section>

      <section>
        <h3>Ferramenta</h3>
        <div className="row wrap">
          {TOOLS.map((t) => (
            <button key={t.key} className={p.tool === t.key ? 'active' : ''} onClick={() => p.setTool(t.key)}>
              {t.label} <kbd>{t.hotkey}</kbd>
            </button>
          ))}
        </div>
        {p.tool === 'select' && (
          <p className="muted small">
            Arraste para selecionar tudo dentro do retângulo (traços que tocam a área) · clique perto de um traço para
            selecioná-lo · <kbd>Shift</kbd>/<kbd>Ctrl</kbd> soma à seleção · <kbd>Delete</kbd> exclui · <kbd>Esc</kbd> limpa.
          </p>
        )}
      </section>

      {p.tool === 'erase' && (
        <section>
          <label className="row" title="Raio da borracha, em pixels da imagem">
            <span>Raio da borracha (px)</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={p.eraserRadius}
              onChange={(e) => p.setEraserRadius(Math.max(0.5, Number(e.target.value) || 0.5))}
            />
          </label>
        </section>
      )}

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
        <label
          className="row check"
          title="Ao trocar de Raiz para Hipocótilo (depois de desenhar a raiz da plântula atual), o ID avança em 1."
        >
          <input type="checkbox" checked={p.autoId} onChange={(e) => p.setAutoId(e.target.checked)} />
          <span>Avançar o ID ao voltar de Raiz para Hipocótilo</span>
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
          <span>Pixel visível em zoom baixo (só visual)</span>
        </label>
        <p className="muted small">
          O traço é gravado em pixels da imagem (cadeia fina, 8-conexa). Abaixo de 100% de zoom cada pixel fica menor que um pixel de tela; a opção acima só o engrossa na exibição.
        </p>
        <p className="muted small">
          Roda do mouse: zoom · Arrastar com <kbd>Espaço</kbd>, botão do meio ou ferramenta Mover: mover a imagem.
        </p>
      </section>
    </div>
  )
}
