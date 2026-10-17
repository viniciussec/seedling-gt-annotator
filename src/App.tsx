import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Viewer from './components/Viewer'
import Toolbar from './components/Toolbar'
import StrokeList from './components/StrokeList'
import LayerPanel from './components/LayerPanel'
import GroupPanel from './components/GroupPanel'
import { mergeStrokes } from './lib/merge'
import { useViewport } from './hooks/useViewport'
import { docReducer, initialDoc } from './state/docReducer'
import { exportGt, exportMasks, loadDraft, parseGt, saveDraft } from './lib/io'
import type { ImageMeta, Layer, Organ, Point, Stroke, Tool } from './types'
import { ORGANS } from './types'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

function readImage(file: File): Promise<Layer> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () =>
      resolve({
        id: newId(),
        name: file.name,
        url,
        img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        visible: true,
        opacity: 1,
      })
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

  const [layers, setLayersState] = useState<Layer[]>([]) // de baixo para cima
  // Fonte da verdade síncrona: várias operações seguidas (antes de re-renderizar) enxergam o estado mais recente.
  const layersRef = useRef<Layer[]>([])
  const setLayers = (next: Layer[] | ((prev: Layer[]) => Layer[])) => {
    const value = typeof next === 'function' ? next(layersRef.current) : next
    layersRef.current = value
    setLayersState(value)
  }
  const [refId, setRefId] = useState<string | null>(null)
  const [showStrokes, setShowStrokes] = useState(true)
  const [tool, setTool] = useState<Tool>('freehand')
  const [organ, setOrgan] = useState<Organ>('hipocotilo')
  const [seedlingId, setSeedlingId] = useState<number | null>(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [groupId, setGroupId] = useState<number | null>(null) // ID de destino do agrupamento
  const [bridgeGaps, setBridgeGaps] = useState(false) // ao fundir, ligar lacunas entre pedaços com linha reta
  const [cursor, setCursor] = useState<Point | null>(null)
  const [eraserRadius, setEraserRadius] = useState(2)
  const [minVisible, setMinVisible] = useState(true)
  // Iteração automática do ID: ao voltar de Raiz para Hipocótilo (fluxo hipocótilo → raiz → próxima plântula).
  const [autoId, setAutoIdState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gt-annotator:autoId') !== '0'
    } catch {
      return true
    }
  })
  const setAutoId = (v: boolean) => {
    setAutoIdState(v)
    try {
      localStorage.setItem('gt-annotator:autoId', v ? '1' : '0')
    } catch {
      /* ignora */
    }
  }
  const [notice, setNotice] = useState<string | null>(null)

  // A camada de referência define o tamanho da imagem e o sistema de coordenadas do GT.
  const ref = layers.find((l) => l.id === refId) ?? layers[0] ?? null
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

  const sizeWarning = (added: Layer[], r: Layer | null) => {
    const bad = r ? added.filter((l) => l.width !== r.width || l.height !== r.height) : []
    return bad.length
      ? `Atenção: ${bad.map((l) => `${l.name} (${l.width}×${l.height})`).join(', ')} difere(m) da referência (${r!.width}×${r!.height}) e será(ão) ajustada(s) a ela.`
      : null
  }

  const onAddImages = async (files: File[]) => {
    const results = await Promise.allSettled(files.map(readImage))
    const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    const failed = results.length - loaded.length
    if (loaded.length === 0) {
      setNotice('Não foi possível ler as imagens selecionadas.')
      return
    }
    const wasEmpty = layersRef.current.length === 0
    // a primeira camada fica opaca; as seguintes entram semitransparentes (ex.: máscara sobre a foto)
    loaded.forEach((l, i) => (l.opacity = wasEmpty && i === 0 ? 1 : 0.5))
    setLayers((prev) => [...prev, ...loaded])

    let msg: string | null = null
    if (wasEmpty) {
      const first = loaded[0]
      setRefId(first.id)
      setSelectedIds([])
      const draft = loadDraft({ name: first.name, width: first.width, height: first.height })
      dispatch({ type: 'reset', strokes: draft ?? [] })
      if (draft?.length) msg = `Rascunho restaurado (${draft.length} traços).`
    }
    msg = sizeWarning(loaded, wasEmpty ? loaded[0] : ref) ?? msg
    if (failed) msg = `${failed} arquivo(s) não puderam ser lidos. ${msg ?? ''}`
    setNotice(msg)
  }

  const toggleLayer = (id: string) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)))
  const setLayerOpacity = (id: string, opacity: number) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, opacity } : l)))
  const moveLayer = (id: string, dir: 'up' | 'down') =>
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.id === id)
      const j = dir === 'up' ? i + 1 : i - 1
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const reorderLayer = (fromId: string, toId: string) =>
    setLayers((prev) => {
      const from = prev.findIndex((l) => l.id === fromId)
      const to = prev.findIndex((l) => l.id === toId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return next
    })
  const removeLayer = (id: string) => {
    const current = layersRef.current
    const target = current.find((l) => l.id === id)
    if (!target) return
    URL.revokeObjectURL(target.url)
    const rest = current.filter((l) => l.id !== id)
    setLayers(rest)
    if (rest.length === 0) {
      setRefId(null)
      setSelectedIds([])
      dispatch({ type: 'reset', strokes: [] })
    } else if ((current.find((l) => l.id === refId) ?? current[0])?.id === id) {
      setRefId(rest[0].id)
      setNotice(`Referência trocada para "${rest[0].name}"; os traços foram mantidos.`)
    }
  }
  const setReference = (id: string) => {
    const l = layersRef.current.find((x) => x.id === id)
    if (!l) return
    setRefId(id)
    setNotice(
      ref && (l.width !== ref.width || l.height !== ref.height)
        ? `Referência alterada para ${l.width}×${l.height}; os traços foram mantidos e podem ficar desalinhados.`
        : null,
    )
  }

  const onImportGt = async (f: File) => {
    try {
      const gt = parseGt(await f.text())
      const mismatch =
        meta && (gt.image.width !== meta.width || gt.image.height !== meta.height)
          ? `Atenção: o GT foi feito para ${gt.image.width}×${gt.image.height}, mas a imagem aberta é ${meta?.width}×${meta?.height}.`
          : null
      dispatch({ type: 'reset', strokes: gt.strokes })
      setSelectedIds([])
      setNotice(mismatch ?? `GT importado (${gt.strokes.length} traços).`)
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  /**
   * Troca o órgão. Com a iteração automática ligada, voltar de Raiz para Hipocótilo avança o ID da plântula,
   * mas só se já existe um traço de raiz com o ID atual (evita avançar ao apenas "olhar" a ferramenta Raiz).
   */
  const changeOrgan = (next: Organ) => {
    if (
      autoId &&
      organ === 'raiz' &&
      next === 'hipocotilo' &&
      seedlingId !== null &&
      doc.strokes.some((s) => s.organ === 'raiz' && s.seedling_id === seedlingId)
    ) {
      setSeedlingId(seedlingId + 1)
    }
    setOrgan(next)
  }

  // --- operações sobre traços ---
  const deleteStrokes = (ids: string[]) => {
    if (ids.length === 0) return
    const drop = new Set(ids)
    dispatch({ type: 'commit', strokes: doc.strokes.filter((s) => !drop.has(s.id)) })
    setSelectedIds((cur) => cur.filter((id) => !drop.has(id)))
  }
  const deleteStroke = (id: string) => deleteStrokes([id])

  // Mantém a seleção coerente quando traços somem (apagar, desfazer, importar...).
  useEffect(() => {
    setSelectedIds((cur) => {
      const alive = cur.filter((id) => doc.strokes.some((s) => s.id === id))
      return alive.length === cur.length ? cur : alive
    })
  }, [doc.strokes])

  /** Próximo ID livre (maior ID existente + 1). */
  const nextFreeId = useMemo(
    () => Math.max(0, ...doc.strokes.map((s) => s.seedling_id ?? 0)) + 1,
    [doc.strokes],
  )

  // Ao mudar a seleção, sugere o ID de destino: o menor ID já presente entre os selecionados
  // (reaproveita uma plântula existente) ou, se nenhum tem ID, o próximo livre.
  const selectionKey = selectedIds.join(',')
  useEffect(() => {
    if (selectedIds.length === 0) return
    const ids = doc.strokes
      .filter((s) => selectedIds.includes(s.id) && s.seedling_id !== null)
      .map((s) => s.seedling_id as number)
    setGroupId(ids.length > 0 ? Math.min(...ids) : nextFreeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  /**
   * Agrupa: atribui `groupId` aos selecionados e, em cada órgão (hipocótilo/raiz), funde todos os traços do grupo
   * em UM só — inclusive traços fora da seleção que já tinham esse ID. Um único passo de desfazer.
   */
  const groupSelected = () => {
    if (groupId === null || selectedIds.length === 0) return
    const sel = new Set(selectedIds)
    const members = doc.strokes.filter((s) => sel.has(s.id) || s.seedling_id === groupId)
    const memberIds = new Set(members.map((s) => s.id))
    const result: Stroke[] = []
    let fused = 0
    for (const o of ORGANS) {
      const list = members.filter((s) => s.organ === o.key)
      if (list.length === 0) continue
      if (list.length === 1) result.push({ ...list[0], seedling_id: groupId })
      else {
        result.push(mergeStrokes(list, groupId, bridgeGaps).stroke)
        fused += list.length - 1
      }
    }
    // os fundidos entram na posição do primeiro membro; o resto da lista é preservado
    const first = doc.strokes.findIndex((s) => memberIds.has(s.id))
    const rest = doc.strokes.filter((s) => !memberIds.has(s.id))
    dispatch({ type: 'commit', strokes: [...rest.slice(0, first), ...result, ...rest.slice(first)] })
    setSelectedIds(result.map((s) => s.id))
    setNotice(
      `Agrupado no ID ${groupId}: ${result.length} traço(s)` + (fused > 0 ? `, ${fused} pedaço(s) fundido(s).` : '.'),
    )
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
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        groupSelected()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        dispatch({ type: 'redo' })
      } else if (!mod) {
        const k = e.key.toLowerCase()
        if (k === 'h') setTool('freehand')
        else if (k === 'd') setTool('draw')
        else if (k === 'e') setTool('erase')
        else if (k === 's') setTool('select')
        else if (k === 'm') setTool('pan')
        else if (k === 'f') fitToView()
        else if ((k === 'delete' || k === 'del') && selectedIds.length > 0) deleteStrokes(selectedIds)
        else ORGANS.forEach((o) => o.hotkey === k && changeOrgan(o.key))
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
        <LayerPanel
          layers={layers}
          refId={ref?.id ?? null}
          showStrokes={showStrokes}
          onToggleStrokes={setShowStrokes}
          onAdd={onAddImages}
          onToggle={toggleLayer}
          onOpacity={setLayerOpacity}
          onMove={moveLayer}
          onReorder={reorderLayer}
          onRemove={removeLayer}
          onSetRef={setReference}
        />
        <Toolbar
          tool={tool}
          setTool={setTool}
          organ={organ}
          setOrgan={changeOrgan}
          autoId={autoId}
          setAutoId={setAutoId}
          eraserRadius={eraserRadius}
          setEraserRadius={setEraserRadius}
          seedlingId={seedlingId}
          setSeedlingId={setSeedlingId}
          minVisible={minVisible}
          setMinVisible={setMinVisible}
          canUndo={doc.past.length > 0}
          canRedo={doc.future.length > 0}
          canExport={!!meta}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onZoom={zoomCenter}
          onFit={fitToView}
          onActualSize={() => meta && actualSize(containerSize().w, containerSize().h, meta.width, meta.height)}
          onImportGt={onImportGt}
          onExport={() => meta && exportGt(meta, doc.strokes)}
          onExportMasks={() => meta && exportMasks(meta, doc.strokes)}
        />
        <h3>
          Traços ({doc.strokes.length})
          {selectedIds.length > 0 && <span className="sel-count"> · {selectedIds.length} selecionado(s)</span>}
        </h3>
        {selectedIds.length > 0 && (
          <GroupPanel
            strokes={doc.strokes}
            selectedIds={selectedIds}
            groupId={groupId}
            setGroupId={setGroupId}
            nextFreeId={nextFreeId}
            bridgeGaps={bridgeGaps}
            setBridgeGaps={setBridgeGaps}
            onGroup={groupSelected}
          />
        )}
        <StrokeList
          strokes={doc.strokes}
          selectedIds={selectedIds}
          onSelect={(id, additive) => {
            setSelectedIds((cur) =>
              additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id],
            )
            setTool('select')
          }}
          onSelectIds={setSelectedIds}
          onDelete={deleteStroke}
          onChangeSeedling={changeSeedling}
        />
      </aside>

      <main className="main">
        <Viewer
          containerRef={containerRef}
          meta={meta}
          layers={layers}
          showStrokes={showStrokes}
          vp={vp}
          zoomAt={zoomAt}
          panBy={panBy}
          strokes={doc.strokes}
          tool={tool}
          organ={organ}
          seedlingId={seedlingId}
          eraserRadius={eraserRadius}
          minVisible={minVisible}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onCommit={(strokes) => {
            setShowStrokes(true)
            dispatch({ type: 'commit', strokes })
          }}
          onSet={(strokes) => dispatch({ type: 'set', strokes })}
          onCheckpoint={() => dispatch({ type: 'checkpoint' })}
          onCursor={setCursor}
        />
        <div className="statusbar">
          <span>{meta ? `${meta.name} · ${meta.width}×${meta.height}` : 'Sem imagem'}</span>
          <span>Zoom {(vp.scale * 100).toFixed(0)}%</span>
          <span>{cursor && meta ? `pixel (${Math.max(0, Math.min(meta.width - 1, Math.floor(cursor[0])))}, ${Math.max(0, Math.min(meta.height - 1, Math.floor(cursor[1])))})` : ''}</span>
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
