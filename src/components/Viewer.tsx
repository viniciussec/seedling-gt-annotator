import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { ImageMeta, Layer, Organ, Pixel, Point, Stroke, Tool } from '../types'
import { organColor } from '../types'
import type { Viewport } from '../hooks/useViewport'
import { appendPixel, bresenham, dist, pixelOf, rasterizePolyline } from '../lib/geometry'

interface Props {
  containerRef: RefObject<HTMLDivElement>
  meta: ImageMeta | null
  layers: Layer[]
  showStrokes: boolean
  vp: Viewport
  zoomAt: (cx: number, cy: number, factor: number) => void
  panBy: (dx: number, dy: number) => void
  strokes: Stroke[]
  tool: Tool
  organ: Organ
  seedlingId: number | null
  eraserRadius: number
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
const SELECT_RADIUS_PX = 8 // raio (em px de tela) para selecionar um traço clicando perto dele

/**
 * Apaga os pixels que estão a até `r` (px da imagem) de algum dos `centers`. Traços cortados ao meio
 * viram vários traços (pedaços com menos de 2 pixels são descartados). Devolve null se nada mudou.
 */
function eraseStrokes(strokes: Stroke[], centers: Point[], r: number): Stroke[] | null {
  let changed = false
  const out: Stroke[] = []
  for (const s of strokes) {
    const keep = s.pixels.map(
      ([x, y]) => !centers.some((c) => Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1]) <= r),
    )
    if (keep.every(Boolean)) {
      out.push(s)
      continue
    }
    changed = true
    let run: Pixel[] = []
    const flush = () => {
      if (run.length >= 2) out.push({ id: newId(), organ: s.organ, seedling_id: s.seedling_id, pixels: run })
      run = []
    }
    s.pixels.forEach((px, i) => (keep[i] ? run.push(px) : flush()))
    flush()
  }
  return changed ? out : null
}

export default function Viewer(p: Props) {
  const { containerRef, meta, vp, zoomAt, panBy, strokes, tool, organ } = p
  const [draft, setDraft] = useState<Pixel[]>([]) // vértices clicados (modo "Pontos"), como pixels
  const [free, setFree] = useState<Pixel[]>([]) // cadeia em andamento (modo "Mão livre")
  const [cursor, setCursor] = useState<Point | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panningNow, setPanningNow] = useState(false)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const rasterRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const panRef = useRef<{ x: number; y: number } | null>(null)
  const clickRef = useRef<{ x: number; y: number } | null>(null)
  const freeRef = useRef<{ chain: Pixel[]; last: Point; len: number } | null>(null)
  const eraseRef = useRef<{ last: Point; started: boolean } | null>(null)
  // Traços mais recentes, de forma síncrona: movimentos seguidos da borracha (antes de re-renderizar) acumulam.
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  const resetFree = () => {
    freeRef.current = null
    setFree([])
  }

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

  /** Prepara um canvas para desenhar em coordenadas CSS, com resolução do monitor. */
  const prepare = (cv: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(size.w * dpr))
    const h = Math.max(1, Math.round(size.h * dpr))
    if (cv.width !== w) cv.width = w
    if (cv.height !== h) cv.height = h
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }

  // --- camada de imagens: desenhadas já na escala atual (sem esticar bitmap); ampliando, sem suavização ---
  useEffect(() => {
    const cv = rasterRef.current
    if (!cv || !meta) return
    const ctx = prepare(cv)
    if (!ctx) return
    ctx.imageSmoothingEnabled = vp.scale < 1
    ctx.imageSmoothingQuality = 'high'
    const dw = meta.width * vp.scale
    const dh = meta.height * vp.scale
    for (const layer of p.layers) {
      if (!layer.visible) continue
      ctx.globalAlpha = layer.opacity
      ctx.drawImage(layer.img, vp.tx, vp.ty, dw, dh)
    }
    ctx.globalAlpha = 1
  }, [size, vp, meta?.width, meta?.height, p.layers]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- camada de desenho: cada pixel do esqueleto é pintado como um pixel da imagem ---
  useEffect(() => {
    const cv = overlayRef.current
    if (!cv || !meta) return
    const ctx = prepare(cv)
    if (!ctx) return
    const s = vp.scale
    // Tamanho do pixel na tela. Com "visibilidade mínima", em zoom baixo cada pixel ocupa ao menos 1 px de tela
    // (apenas visual; os dados não mudam).
    const size1 = p.minVisible ? Math.max(s, 1) : s
    const off = (s - size1) / 2
    const paint = (pixels: Pixel[], color: string, extra = 0) => {
      ctx.fillStyle = color
      for (const [x, y] of pixels) {
        ctx.fillRect(vp.tx + x * s + off - extra, vp.ty + y * s + off - extra, size1 + 2 * extra, size1 + 2 * extra)
      }
    }

    if (p.showStrokes) {
      for (const st of strokes) {
        if (st.id === p.selectedId) paint(st.pixels, '#ffffff', Math.max(1.5, s * 0.35)) // contorno de seleção
      }
      for (const st of strokes) paint(st.pixels, organColor(st.organ))
    }

    const color = organColor(organ)
    if (free.length > 0) paint(free, color)
    if (draft.length > 0) {
      paint(rasterizePolyline(draft, meta.width, meta.height), color)
      // marcadores dos vértices e linha-guia até o cursor
      ctx.strokeStyle = color
      ctx.fillStyle = '#fff'
      draft.forEach(([x, y], i) => {
        const r = i === 0 ? 4.5 : 3
        ctx.beginPath()
        ctx.rect(vp.tx + (x + 0.5) * s - r, vp.ty + (y + 0.5) * s - r, 2 * r, 2 * r)
        ctx.fill()
        ctx.stroke()
      })
      if (cursor) {
        const [lx, ly] = draft[draft.length - 1]
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(vp.tx + (lx + 0.5) * s, vp.ty + (ly + 0.5) * s)
        ctx.lineTo(vp.tx + cursor[0] * s, vp.ty + cursor[1] * s)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    if (tool === 'erase' && cursor) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(vp.tx + cursor[0] * s, vp.ty + cursor[1] * s, Math.max(2, p.eraserRadius * s), 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [size, vp, meta?.width, meta?.height, strokes, p.selectedId, p.showStrokes, p.minVisible, free, draft, cursor, tool, organ, p.eraserRadius]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // --- rascunhos em andamento são descartados ao trocar de ferramenta/imagem ---
  // (dependências primitivas: o objeto `meta` pode ser recriado a cada render sem que a imagem mude)
  useEffect(() => {
    setDraft([])
    resetFree()
    eraseRef.current = null
  }, [tool, meta?.name, meta?.width, meta?.height]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitPixels = (pixels: Pixel[]) => {
    if (pixels.length >= 2) {
      p.onCommit([...strokes, { id: newId(), organ, seedling_id: p.seedlingId, pixels }])
    }
  }

  const finishDraft = () => {
    if (meta) commitPixels(rasterizePolyline(draft, meta.width, meta.height))
    setDraft([])
  }

  // --- teclado local: espaço (mover temporário), Enter, Esc, Backspace ---
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
  const toPixel = (ip: Point): Pixel => pixelOf(ip, meta!.width, meta!.height)

  /** Apaga ao longo do segmento a→b (amostrado para não deixar lacunas em movimentos rápidos). */
  const eraseAlong = (a: Point, b: Point) => {
    const r = Math.max(0.5, p.eraserRadius)
    const steps = Math.max(1, Math.ceil(dist(a, b) / (r * 0.5)))
    const centers: Point[] = []
    for (let i = 0; i <= steps; i++) centers.push([a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps])
    const next = eraseStrokes(strokesRef.current, centers, r)
    if (!next) return
    strokesRef.current = next
    if (eraseRef.current && !eraseRef.current.started) {
      eraseRef.current.started = true
      p.onCheckpoint() // um único passo de "desfazer" para todo o gesto da borracha
    }
    if (p.selectedId && !next.some((s) => s.id === p.selectedId)) p.onSelect(null)
    p.onSet(next)
  }

  /** Seleciona o traço com pixel mais próximo do ponto (dentro do raio de seleção). */
  const selectAt = (ip: Point) => {
    const maxD = Math.max(1, SELECT_RADIUS_PX / vp.scale)
    let best: { id: string; d: number } | null = null
    for (const s of strokes) {
      for (const [x, y] of s.pixels) {
        const d = Math.hypot(x + 0.5 - ip[0], y + 0.5 - ip[1])
        if (d <= maxD && (!best || d < best.d)) best = { id: s.id, d }
      }
    }
    p.onSelect(best ? best.id : null)
  }

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
    const ip = toImage(e)
    if (tool === 'freehand') {
      const first = toPixel(ip)
      freeRef.current = { chain: [first], last: ip, len: 0 }
      setFree([first])
      capture(e.currentTarget, e.pointerId)
    } else if (tool === 'draw') {
      clickRef.current = { x: e.clientX, y: e.clientY }
      capture(e.currentTarget, e.pointerId)
    } else if (tool === 'erase') {
      eraseRef.current = { last: ip, started: false }
      capture(e.currentTarget, e.pointerId)
      eraseAlong(ip, ip)
    } else if (tool === 'select') {
      selectAt(ip)
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      panBy(e.clientX - panRef.current.x, e.clientY - panRef.current.y)
      panRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    if (!meta) return
    const ip = toImage(e)
    setCursor(ip)
    p.onCursor(ip)

    const f = freeRef.current
    if (f) {
      // usa os eventos "coalescidos" para não perder detalhe em movimentos rápidos
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
      const samples = evs.length > 0 ? evs : [e.nativeEvent]
      let added = false
      for (const ev of samples) {
        const q = toImage(ev)
        if (dist(f.last, q) * vp.scale < 1) continue // amostra a cada ~1 px de tela
        // liga o pixel anterior ao novo por Bresenham: a cadeia fica 8-conexa e fina
        const from = f.chain[f.chain.length - 1]
        for (const px of bresenham(from, toPixel(q)).slice(1)) appendPixel(f.chain, px)
        f.len += dist(f.last, q)
        f.last = q
        added = true
      }
      if (added) setFree([...f.chain])
      return
    }

    const er = eraseRef.current
    if (er) {
      eraseAlong(er.last, ip)
      er.last = ip
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      panRef.current = null
      setPanningNow(false)
    }
    eraseRef.current = null

    const f = freeRef.current
    if (f) {
      resetFree()
      // ignora cliques/toques sem arrasto real (< 4 px de tela de percurso)
      if (f.len * vp.scale >= CLICK_TOLERANCE_PX) commitPixels(f.chain)
      return
    }

    const c = clickRef.current
    clickRef.current = null
    if (c && meta && Math.hypot(e.clientX - c.x, e.clientY - c.y) <= CLICK_TOLERANCE_PX) {
      const px = toPixel(toImage(e))
      setDraft((d) => (d.length > 0 && d[d.length - 1][0] === px[0] && d[d.length - 1][1] === px[1] ? d : [...d, px]))
    }
  }

  const cursorStyle = panningNow
    ? 'grabbing'
    : tool === 'pan' || spaceDown
      ? 'grab'
      : tool === 'select'
        ? 'default'
        : 'crosshair'

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
      {!meta && <div className="viewer-empty">Adicione uma ou mais imagens (painel Camadas) para começar.</div>}
      {meta && <canvas ref={rasterRef} className="raster" />}
      {meta && <canvas ref={overlayRef} className="overlay" />}

      {draft.length > 0 && (
        <div className="draft-hint">
          {draft.length} ponto(s) — <kbd>Enter</kbd>/duplo clique finaliza · <kbd>Backspace</kbd> remove último ·{' '}
          <kbd>Esc</kbd> cancela
        </div>
      )}
    </div>
  )
}
