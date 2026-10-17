import type { Organ, Pixel, Stroke } from '../types'
import { bresenham } from './geometry'
import { newId } from './id'

const gap = (a: Pixel, b: Pixel) => Math.hypot(a[0] - b[0], a[1] - b[1])
const ADJACENT = Math.SQRT2 + 1e-9 // vizinhos 8: distância 1 ou √2

/**
 * Ordena e orienta os pedaços para formar um único caminho com a menor soma de lacunas:
 * testa cada pedaço (nos dois sentidos) como início e encadeia sempre o mais próximo da ponta.
 */
function orderFragments(frags: Pixel[][]): { ordered: Pixel[][]; total: number } {
  if (frags.length === 1) return { ordered: [frags[0]], total: 0 }
  let best: { ordered: Pixel[][]; total: number } | null = null
  for (let s = 0; s < frags.length; s++) {
    for (const rev of [false, true]) {
      const first = rev ? [...frags[s]].reverse() : frags[s]
      const ordered: Pixel[][] = [first]
      const used = new Set([s])
      let total = 0
      while (used.size < frags.length) {
        const tail = ordered[ordered.length - 1][ordered[ordered.length - 1].length - 1]
        let pick: { j: number; frag: Pixel[]; d: number } | null = null
        for (let j = 0; j < frags.length; j++) {
          if (used.has(j)) continue
          for (const f of [frags[j], [...frags[j]].reverse()]) {
            const d = gap(tail, f[0])
            if (!pick || d < pick.d) pick = { j, frag: f, d }
          }
        }
        used.add(pick!.j)
        ordered.push(pick!.frag)
        total += pick!.d
      }
      if (!best || total < best.total) best = { ordered, total }
    }
  }
  return best!
}

export interface MergeResult {
  stroke: Stroke
  /** Junções entre pedaços que não são vizinhas (há lacuna) e a distância somada dessas lacunas, em px. */
  gaps: number
  gapLength: number
}

/**
 * Funde traços do mesmo órgão em UM traço. Pixels repetidos (sobreposição) entram uma vez só.
 * Lacunas entre pedaços ficam como estão, a menos que `bridge` seja true: nesse caso são preenchidas
 * com uma linha reta de pixels (o que ACRESCENTA pixels que não foram desenhados).
 */
export function mergeStrokes(strokes: Stroke[], seedlingId: number | null, bridge: boolean): MergeResult {
  const organ: Organ = strokes[0].organ
  const { ordered } = orderFragments(strokes.map((s) => s.pixels))
  const seen = new Set<string>()
  const pixels: Pixel[] = []
  const add = (p: Pixel) => {
    const k = `${p[0]},${p[1]}`
    if (seen.has(k)) return
    seen.add(k)
    pixels.push(p)
  }
  let gaps = 0
  let gapLength = 0
  ordered.forEach((frag, i) => {
    if (i > 0) {
      const tail = pixels[pixels.length - 1]
      const d = gap(tail, frag[0])
      // sobreposição (algum pixel já presente) também conta como conectado: só é lacuna se o pedaço não toca a cadeia
      const overlaps = frag.some((p) => seen.has(`${p[0]},${p[1]}`))
      if (d > ADJACENT && !overlaps) {
        gaps++
        gapLength += d
        if (bridge) bresenham(tail, frag[0]).slice(1, -1).forEach(add)
      }
    }
    frag.forEach(add)
  })
  return { stroke: { id: newId(), organ, seedling_id: seedlingId, pixels }, gaps, gapLength }
}
