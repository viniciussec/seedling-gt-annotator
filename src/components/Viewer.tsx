import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { ImageMeta, Organ, Point, Stroke, Tool } from '../types'
import { organColor } from '../types'
import type { Viewport } from '../hooks/useViewport'
import { clamp, dist, polylineLength, simplifyRdp } from '../lib/geometry'
import { useImage } from '../hooks/useImage'

interface Props {
  containerRef: RefObject<HTMLDivElement>
  meta: ImageMeta | null
  baseUrl: string | null
  labelUrl: string | null
  labelOpacity: number
  vp: Viewport
  zoomAt: (cx: number, cy: number, factor: number) => void
  panBy: (dx: number, dy: number) => void
  strokes: Stroke[]
  tool: Tool
  organ: Organ
  seedlingId: number | null
  simplifyTol: number
  minVisible: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCommit: (strokes: Stroke[]) => void
  onSet: (strokes: Stroke[]) => void
  onCheckpoint: () => void
  onCursor: (p: Point | null) => void
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** Captura o ponteiro, ignorando falhas (ex.: pointerId já inativo). */
const capture = (el: Element, id: number) => {
  try {
    el.setPointerCapture(id)
  } catch {
    /* sem captura: o gesto continua funcionando dentro do contêiner */
  }
}

const CLICK_TOLERANCE_PX = 4 // acima disso o gesto é um arraste, não um clique

export default function Viewer(p: Props) {
  const { containerRef, meta, vp, zoomAt, panBy, strokes, tool, organ } = p
  const [draft, setDraft] = useState<Point[]>([])
  const [cursor, setCursor] = useState<Point | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panningNow, setPanningNow] = useState(false)

  // mão livre: pontos do traço em andamento (ref para leitura imediata + state para renderizar)
  const [free, setFree] = useState<Point[]>([])
  const freeRef = useRef<Point[] | null>(null)
  const resetFree = () => {
    freeRef.current = null
    setFree([])
  }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const baseImg = useImage(p.baseUrl)
  const labelImg = useImage(p.labelUrl)

  const panRef = useRef<{ x: number; y: number } | null>(null)
  const clickRef = useRef<{ x: number; y: number } | null>(null)
  const vertexRef = useRef<{ strokeId: string; index: number } | null>(null)

  // --- tamanho do contêiner (em px CSS) ---
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  // --- raster: imagem e máscara desenhadas direto no canvas, já na escala atual e na resolução do monitor.
  // Evita escalar uma camada pronta por CSS (que estica o bitmap e borra). Ampliando, sem suavização:
  // cada pixel da imagem aparece como um bloco nítido.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !meta) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(size.w * dpr))
    const h = Math.max(1, Math.round(size.h * dpr))
    if (cv.width !== w) cv.width = w
    if (cv.height !== h) cv.height = h
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = vp.scale < 1
    ctx.imageSmoothingQuality = 'high'
    const dw = meta.width * vp.scale
    const dh = meta.height * vp.scale
    if (baseImg) ctx.drawImage(baseImg, vp.tx, vp.ty, dw, dh)
    if (labelImg) {
      ctx.globalAlpha = baseImg ? p.labelOpacity : 1
      ctx.drawImage(labelImg, vp.tx, vp.ty, dw, dh)
      ctx.globalAlpha = 1
    }
  }, [size, vp, meta?.width, meta?.height, baseImg, labelImg, p.labelOpacity]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- zoom com a roda (listener não-passivo para poder chamar preventDefault) ---
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef, zoomAt])

  // --- rascunho em andamento é descartado ao trocar de ferramenta/imagem ---
  // (dependências primitivas: o objeto `meta` pode ser recriado a cada render sem que a imagem mude)
  useEffect(() => {
    setDraft([])
    resetFree()
  }, [tool, meta?.name, meta?.width, meta?.height]) // eslint-disable-line react-hooks/exhaustive-deps

  const finishDraft = () => {
    if (draft.length >= 2) {
      p.onCommit([
        ...strokes,
        { id: newId(), organ, seedling_id: p.seedlingId, points: draft },
      ])
    }
    setDraft([])
  }

  // --- teclado local: espaço (pan temporário), Enter, Esc, Backspace ---
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        setSpaceDown(true)
      } else if (e.key === 'Enter' && tool === 'draw') finishDraft()
      else if (e.key === 'Escape') {
        setDraft([])
        resetFree()
        p.onSelect(null)
      } else if (e.key === 'Backspace' && tool === 'draw' && draft.length > 0) {
        e.preventDefault()
        setDraft((d) => d.slice(0, -1))
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  const toImage = (e: { clientX: number; clientY: number }): Point => {
    const r = containerRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left - vp.tx) / vp.scale, (e.clientY - r.top - vp.ty) / vp.scale]
  }
  const clampToImage = ([x, y]: Point): Point =>
    meta ? [clamp(x, 0, meta.width), clamp(y, 0, meta.height)] : [x, y]

  // --- ponteiro ---
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!meta) return
    const wantsPan = e.button === 1 || (e.button === 0 && (tool === 'pan' || spaceDown))
    if (wantsPan) {
      e.preventDefault()
      panRef.current = { x: e.clientX, y: e.clientY }
      setPanningNow(true)
      capture(e.currentTarget, e.pointerId)
      return
    }
    if (e.button !== 0) return
    if (tool === 'freehand') {
      const first = clampToImage(toImage(e))
      freeRef.current = [first]
      setFree([first])
      capture(e.currentTarget, e.pointerId)
    } else if (tool === 'draw') {
      clickRef.current = { x: e.clientX, y: e.clientY }
      capture(e.currentTarget, e.pointerId)
    } else if (tool === 'select') {
      p.onSelect(null) // clique no fundo desmarca (traços e vértices interceptam o evento antes)
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      panBy(e.clientX - panRef.current.x, e.clientY - panRef.current.y)
      panRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    const ip = toImage(e)
    setCursor(ip)
    p.onCursor(ip)
    if (freeRef.current) {
      // usa os eventos "coalescidos" para não perder detalhe em movimentos rápidos
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
      const samples = evs.length > 0 ? evs : [e.nativeEvent]
      const pts = freeRef.current
      let added = false
      for (const ev of samples) {
        const q = clampToImage(toImage(ev))
        if (dist(pts[pts.length - 1], q) * vp.scale >= 1.5) {
          pts.push(q) // amostra a cada ~1,5 px de tela
          added = true
        }
      }
      if (added) setFree([...pts])
      return
    }
    const v = vertexRef.current
    if (v) {
      const target = clampToImage(ip)
      p.onSet(
        strokes.map((s) =>
          s.id === v.strokeId ? { ...s, points: s.points.map((q, i) => (i === v.index ? target : q)) } : s,
        ),
      )
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      panRef.current = null
      setPanningNow(false)
    }
    vertexRef.current = null
    if (freeRef.current) {
      const pts = freeRef.current
      const last = clampToImage(toImage(e))
      if (dist(pts[pts.length - 1], last) > 0) pts.push(last)
      resetFree()
      // ignora toques/cliques sem arrasto real (< 4 px de tela de comprimento)
      if (pts.length >= 2 && polylineLength(pts) * vp.scale >= CLICK_TOLERANCE_PX) {
        const simplified = simplifyRdp(pts, p.simplifyTol)
        p.onCommit([...strokes, { id: newId(), organ, seedling_id: p.seedlingId, points: simplified }])
      }
      return
    }
    const c = clickRef.current
    clickRef.current = null
    if (c && Math.hypot(e.clientX - c.x, e.clientY - c.y) <= CLICK_TOLERANCE_PX) {
      const pt = clampToImage(toImage(e))
      setDraft((d) => (d.length > 0 && dist(d[d.length - 1], pt) * vp.scale < 3 ? d : [...d, pt]))
    }
  }

  const startVertexDrag = (e: ReactPointerEvent, strokeId: string, index: number) => {
    if (e.button !== 0 || tool !== 'select') return
    e.stopPropagation()
    p.onSelect(strokeId)
    p.onCheckpoint()
    vertexRef.current = { strokeId, index }
    capture(containerRef.current!, e.pointerId)
  }

  const removeVertex = (e: ReactMouseEvent, strokeId: string, index: number) => {
    e.preventDefault()
    if (tool !== 'select') return
    const next = strokes.map((s) =>
      s.id === strokeId && s.points.length > 2 ? { ...s, points: s.points.filter((_, i) => i !== index) } : s,
    )
    p.onCommit(next)
  }

  const cursorStyle =
    panningNow ? 'grabbing' : tool === 'pan' || spaceDown ? 'grab' : tool === 'draw' || tool === 'freehand' ? 'crosshair' : 'default'

  const r = 2.5 / vp.scale // raio dos vértices constante na tela (marcadores pequenos)
  // Traço com exatamente 1 pixel da imagem. Com "visibilidade mínima", em zoom < 100% a linha é
  // engrossada só o suficiente para ocupar 1 pixel de tela (apenas visual; os dados não mudam).
  const lineW = p.minVisible ? Math.max(1, 1 / vp.scale) : 1

  return (
    <div
      ref={containerRef}
      className="viewer"
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setCursor(null)
        p.onCursor(null)
      }}
      onDoubleClick={() => tool === 'draw' && finishDraft()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!meta && <div className="viewer-empty">Carregue uma imagem (e/ou a máscara de labels) para começar.</div>}

      {meta && <canvas ref={canvasRef} className="raster" />}

      {meta && (
        // O SVG cobre o contêiner e a transformação fica DENTRO dele: o navegador redesenha o vetor
        // na resolução nativa a cada zoom (sem esticar bitmap).
        <svg className="overlay">
          <g transform={`translate(${vp.tx} ${vp.ty}) scale(${vp.scale})`}>
            {strokes.map((s) => {
              const color = organColor(s.organ)
              const selected = s.id === p.selectedId
              const pts = s.points.map((q) => q.join(',')).join(' ')
              return (
                <g key={s.id}>
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={color}
                    strokeWidth={lineW}
                    strokeLinejoin="miter"
                    strokeLinecap="butt"
                  />
                  {/* área de clique mais larga e invisível */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none' }}
                    onPointerDown={(e) => {
                      if (tool !== 'select' || e.button !== 0) return
                      e.stopPropagation()
                      p.onSelect(s.id)
                    }}
                  />
                  {(selected || tool === 'select') &&
                    s.points.map((q, i) => (
                      <circle
                        key={i}
                        cx={q[0]}
                        cy={q[1]}
                        r={i === 0 ? r * 1.6 : r}
                        fill={i === 0 ? color : selected ? '#fff' : 'rgba(255,255,255,.5)'}
                        stroke={color}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        style={{ pointerEvents: tool === 'select' ? 'all' : 'none', cursor: 'move' }}
                        onPointerDown={(e) => startVertexDrag(e, s.id, i)}
                        onContextMenu={(e) => removeVertex(e, s.id, i)}
                      />
                    ))}
                </g>
              )
            })}

            {free.length > 1 && (
              <polyline
                points={free.map((q) => q.join(',')).join(' ')}
                fill="none"
                stroke={organColor(organ)}
                strokeWidth={lineW}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {draft.length > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                <polyline
                  points={draft.map((q) => q.join(',')).join(' ')}
                  fill="none"
                  stroke={organColor(organ)}
                  strokeWidth={lineW}
                  strokeLinejoin="miter"
                  strokeLinecap="butt"
                />
                {cursor && (
                  <line
                    x1={draft[draft.length - 1][0]}
                    y1={draft[draft.length - 1][1]}
                    x2={cursor[0]}
                    y2={cursor[1]}
                    stroke={organColor(organ)}
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {draft.map((q, i) => (
                  <circle key={i} cx={q[0]} cy={q[1]} r={i === 0 ? r * 1.6 : r} fill={organColor(organ)} />
                ))}
              </g>
            )}
          </g>
        </svg>
      )}

      {draft.length > 0 && (
        <div className="draft-hint">
          {draft.length} ponto(s) — <kbd>Enter</kbd>/duplo clique finaliza · <kbd>Backspace</kbd> remove último ·{' '}
          <kbd>Esc</kbd> cancela
        </div>
      )}
    </div>
  )
}
