import type { Pixel, Point } from '../types'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Comprimento de uma polilinha (soma dos segmentos). */
export function polylineLength(pts: Point[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i])
  return total
}

/** Pixel da imagem que contém a posição contínua `p` (limitado ao tamanho da imagem). */
export const pixelOf = (p: Point, w: number, h: number): Pixel => [
  clamp(Math.floor(p[0]), 0, w - 1),
  clamp(Math.floor(p[1]), 0, h - 1),
]

/** Linha de Bresenham entre dois pixels, incluindo ambos. */
export function bresenham(a: Pixel, b: Pixel): Pixel[] {
  const out: Pixel[] = []
  let [x, y] = a
  const dx = Math.abs(b[0] - x)
  const dy = -Math.abs(b[1] - y)
  const sx = x < b[0] ? 1 : -1
  const sy = y < b[1] ? 1 : -1
  let err = dx + dy
  for (;;) {
    out.push([x, y])
    if (x === b[0] && y === b[1]) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return out
}

/**
 * Acrescenta um pixel a uma cadeia mantendo-a 8-conexa e "fina": ignora repetição, desfaz retorno
 * sobre o pixel anterior e remove o pixel de quina quando o anterior-do-anterior já é vizinho (8)
 * do novo. É o mesmo critério que separa uma linha de 1 pixel de uma "escada" de 4-vizinhos.
 */
export function appendPixel(chain: Pixel[], p: Pixel): void {
  const n = chain.length
  if (n > 0 && chain[n - 1][0] === p[0] && chain[n - 1][1] === p[1]) return
  if (n >= 2) {
    const a = chain[n - 2]
    if (a[0] === p[0] && a[1] === p[1]) {
      chain.pop()
      return
    }
    if (Math.max(Math.abs(a[0] - p[0]), Math.abs(a[1] - p[1])) <= 1) {
      chain[n - 1] = p
      return
    }
  }
  chain.push(p)
}

/** Rasteriza uma polilinha (pontos na imagem) em uma cadeia de pixels 8-conexa e fina. */
export function rasterizePolyline(pts: Point[], w: number, h: number): Pixel[] {
  if (pts.length === 0) return []
  let last = pixelOf(pts[0], w, h)
  const chain: Pixel[] = [last]
  for (let i = 1; i < pts.length; i++) {
    const next = pixelOf(pts[i], w, h)
    for (const px of bresenham(last, next).slice(1)) appendPixel(chain, px)
    last = next
  }
  return chain
}

/** Comprimento da cadeia de pixels (código de Freeman): 1 por passo ortogonal, √2 por diagonal. */
export function chainLength(pixels: Pixel[]): number {
  let total = 0
  for (let i = 1; i < pixels.length; i++) {
    total += pixels[i][0] !== pixels[i - 1][0] && pixels[i][1] !== pixels[i - 1][1] ? Math.SQRT2 : 1
  }
  return total
}
