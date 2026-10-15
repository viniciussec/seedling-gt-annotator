import { useCallback, useState } from 'react'
import { clamp } from '../lib/geometry'

export interface Viewport {
  tx: number
  ty: number
  scale: number
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 64

/** Estado de zoom/pan. A imagem é desenhada com `translate(tx,ty) scale(scale)`, origem no canto superior esquerdo. */
export function useViewport() {
  const [vp, setVp] = useState<Viewport>({ tx: 0, ty: 0, scale: 1 })

  /** Zoom mantendo fixo o ponto (cx, cy), dado em coordenadas do contêiner. */
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setVp((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = scale / v.scale
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }
    })
  }, [])

  const panBy = useCallback((dx: number, dy: number) => {
    setVp((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
  }, [])

  const fit = useCallback((cw: number, ch: number, iw: number, ih: number, margin = 24) => {
    const scale = clamp(Math.min((cw - 2 * margin) / iw, (ch - 2 * margin) / ih), MIN_SCALE, MAX_SCALE)
    setVp({ scale, tx: (cw - iw * scale) / 2, ty: (ch - ih * scale) / 2 })
  }, [])

  const actualSize = useCallback((cw: number, ch: number, iw: number, ih: number) => {
    setVp({ scale: 1, tx: (cw - iw) / 2, ty: (ch - ih) / 2 })
  }, [])

  return { vp, zoomAt, panBy, fit, actualSize }
}
