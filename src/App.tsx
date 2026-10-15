import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Viewer from './components/Viewer'
import Toolbar from './components/Toolbar'
import StrokeList from './components/StrokeList'
import { useViewport } from './hooks/useViewport'
import { docReducer, initialDoc } from './state/docReducer'
import { exportGt, loadDraft, parseGt, saveDraft } from './lib/io'
import type { ImageMeta, Organ, Point, Stroke, Tool } from './types'
import { ORGANS } from './types'

interface Loaded {
  url: string
  name: string
  width: number
  height: number
}

function readImage(file: File): Promise<Loaded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ url, name: file.name, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Não foi possível ler a imagem "${file.name}".`))
    }
    img.src = url
  })
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { vp, zoomAt, panBy, fit, actualSize } = useViewport()
  const [doc, dispatch] = useReducer(docReducer, initialDoc)

  const [base, setBase] = useState<Loaded | null>(null)
  const [label, setLabel] = useState<Loaded | null>(null)
  const [labelOpacity, setLabelOpacity] = useState(0.5)
  const [tool, setTool] = useState<Tool>('freehand')
  const [organ, setOrgan] = useState<Organ>('hipocotilo')
  const [seedlingId, setSeedlingId] = useState<number | null>(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [simplifyTol, setSimplifyTol] = useState(0.4)
  const [minVisible, setMinVisible] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // A imagem de referência define o sistema de coordenadas; sem ela, usa-se a máscara.
  const ref = base ?? label
  const meta: ImageMeta | null = useMemo(
    () => (ref ? { name: ref.name, width: ref.width, height: ref.height } : null),
    [ref?.name, ref?.width, ref?.height], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const containerSize = () => {
    const r = containerRef.current?.getBoundingClientRect()
    return { w: r?.width ?? 800, h: r?.height ?? 600 }
  }

  const fitToView = useCallback(() => {
    if (!meta) return
    const { w, h } = containerSize()
    fit(w, h, meta.width, meta.height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.width, meta?.height, fit])

  // Enquadra automaticamente quando a imagem de referência muda.
  useEffect(() => {
    if (!meta) return
    const id = requestAnimationFrame(fitToView)
    return () => cancelAnimationFrame(id)
  }, [meta?.name, meta?.width, meta?.height, fitToView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave local (rascunho) a cada alteração.
  useEffect(() => {
    if (meta) saveDraft(meta, doc.strokes)
  }, [meta?.name, meta?.width, meta?.height, doc.strokes]) // eslint-disable-line react-hooks/exhaustive-deps

  const checkSizes = (a: Loaded | null, b: Loaded | null) =>
    a && b && (a.width !== b.width || a.height !== b.height)
      ? `Atenção: imagem (${a.width}×${a.height}) e máscara (${b.width}×${b.height}) têm tamanhos diferentes.`
      : null

  const onPickBase = async (f: File) => {
    try {
      const loaded = await readImage(f)
      if (base) URL.revokeObjectURL(base.url)
      setBase(loaded)
      setSelectedId(null)
      const m = { name: loaded.name, width: loaded.width, height: loaded.height }
      const draft = loadDraft(m)
      dispatch({ type: 'reset', strokes: draft ?? [] })
      setNotice(checkSizes(loaded, label) ?? (draft?.length ? `Rascunho restaurado (${draft.length} traços).` : null))
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  const onPickLabel = async (f: File) => {
    try {
      const loaded = await readImage(f)
      if (label) URL.revokeObjectURL(label.url)
      setLabel(loaded)
      if (!base) {
        const draft = loadDraft({ name: loaded.name, width: loaded.width, height: loaded.height })
        dispatch({ type: 'reset', strokes: draft ?? [] })
      }
      setNotice(checkSizes(base, loaded))
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  const onImportGt = async (f: File) => {
    try {
      const gt = parseGt(await f.text())
      const mismatch =
        meta && (gt.image.width !== meta.width || gt.image.height !== meta.height)
          ? `Atenção: o GT foi feito para ${gt.image.width}×${gt.image.height}, mas a imagem aberta é ${meta?.width}×${meta?.height}.`
          : null
      dispatch({ type: 'reset', strokes: gt.strokes })
      setSelectedId(null)
      setNotice(mismatch ?? `GT importado (${gt.strokes.length} traços).`)
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  // --- operações sobre traços ---
  const deleteStroke = (id: string) => {
    dispatch({ type: 'commit', strokes: doc.strokes.filter((s) => s.id !== id) })
    if (selectedId === id) setSelectedId(null)
  }
  const changeSeedling = (id: string, sid: number | null) =>
    dispatch({
      type: 'commit',
      strokes: doc.strokes.map((s): Stroke => (s.id === id ? { ...s, seedling_id: sid } : s)),
    })

  // --- atalhos globais ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        dispatch({ type: 'redo' })
      } else if (!mod) {
        const k = e.key.toLowerCase()
        if (k === 'h') setTool('freehand')
        else if (k === 'd') setTool('draw')
        else if (k === 's') setTool('select')
        else if (k === 'm') setTool('pan')
        else if (k === 'f') fitToView()
        else if ((k === 'delete' || k === 'del') && selectedId) deleteStroke(selectedId)
        else ORGANS.forEach((o) => o.hotkey === k && setOrgan(o.key))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const zoomCenter = (factor: number) => {
    const { w, h } = containerSize()
    zoomAt(w / 2, h / 2, factor)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Anotador de Esqueletos</h1>
        <Toolbar
          tool={tool}
          setTool={setTool}
          organ={organ}
          setOrgan={setOrgan}
          simplifyTol={simplifyTol}
          setSimplifyTol={setSimplifyTol}
          seedlingId={seedlingId}
          setSeedlingId={setSeedlingId}
          labelOpacity={labelOpacity}
          setLabelOpacity={setLabelOpacity}
          minVisible={minVisible}
          setMinVisible={setMinVisible}
          hasBase={!!base}
          hasLabel={!!label}
          canUndo={doc.past.length > 0}
          canRedo={doc.future.length > 0}
          canExport={!!meta}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onZoom={zoomCenter}
          onFit={fitToView}
          onActualSize={() => meta && actualSize(containerSize().w, containerSize().h, meta.width, meta.height)}
          onPickBase={onPickBase}
          onPickLabel={onPickLabel}
          onImportGt={onImportGt}
          onExport={() => meta && exportGt(meta, doc.strokes)}
        />
        <h3>Traços ({doc.strokes.length})</h3>
        <StrokeList
          strokes={doc.strokes}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setTool('select')
          }}
          onDelete={deleteStroke}
          onChangeSeedling={changeSeedling}
        />
      </aside>

      <main className="main">
        <Viewer
          containerRef={containerRef}
          meta={meta}
          baseUrl={base?.url ?? null}
          labelUrl={label?.url ?? null}
          labelOpacity={labelOpacity}
          vp={vp}
          zoomAt={zoomAt}
          panBy={panBy}
          strokes={doc.strokes}
          tool={tool}
          organ={organ}
          seedlingId={seedlingId}
          simplifyTol={simplifyTol}
          minVisible={minVisible}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCommit={(strokes) => dispatch({ type: 'commit', strokes })}
          onSet={(strokes) => dispatch({ type: 'set', strokes })}
          onCheckpoint={() => dispatch({ type: 'checkpoint' })}
          onCursor={setCursor}
        />
        <div className="statusbar">
          <span>{meta ? `${meta.name} · ${meta.width}×${meta.height}` : 'Sem imagem'}</span>
          <span>Zoom {(vp.scale * 100).toFixed(0)}%</span>
          <span>{cursor ? `x ${cursor[0].toFixed(1)}  y ${cursor[1].toFixed(1)}` : ''}</span>
          {notice && (
            <span className="notice" onClick={() => setNotice(null)} title="Clique para dispensar">
              {notice}
            </span>
          )}
        </div>
      </main>
    </div>
  )
}
