import type { GtFile, ImageMeta, Pixel, Point, Stroke } from '../types'
import { ORGANS } from '../types'
import { rasterizePolyline } from './geometry'

const stem = (name: string) => name.replace(/\.[^.]+$/, '')

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Exporta o GT (JSON v2): cadeias de pixels inteiros, por traço. */
export function exportGt(meta: ImageMeta, strokes: Stroke[]): void {
  const data: GtFile = {
    version: 2,
    coordinate_system: 'image-pixels-xy-integer',
    image: meta,
    strokes,
  }
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${stem(meta.name)}.gt.json`)
}

/**
 * Exporta uma máscara binária por órgão (PNG, mesmo tamanho da imagem; esqueleto = 255, fundo = 0),
 * pronta para comparar pixel a pixel com a saída dos algoritmos.
 */
export async function exportMasks(meta: ImageMeta, strokes: Stroke[]): Promise<void> {
  for (const organ of ORGANS) {
    const canvas = document.createElement('canvas')
    canvas.width = meta.width
    canvas.height = meta.height
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(meta.width, meta.height)
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255 // fundo preto opaco
    for (const s of strokes) {
      if (s.organ !== organ.key) continue
      for (const [x, y] of s.pixels) {
        const o = (y * meta.width + x) * 4
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (blob) download(blob, `${stem(meta.name)}.gt.${organ.key}.png`)
  }
}

const isPixel = (p: unknown): p is Pixel =>
  Array.isArray(p) && p.length === 2 && p.every((v) => Number.isInteger(v))

/** Converte um traço bruto (formato v2 `pixels` ou v1 `points`) para o formato atual. */
function normalizeStroke(s: any, w: number, h: number): Stroke | null {
  if (!s || typeof s.id !== 'string' || (s.organ !== 'hipocotilo' && s.organ !== 'raiz')) return null
  let pixels: Pixel[] | null = null
  if (Array.isArray(s.pixels) && s.pixels.every(isPixel)) {
    pixels = s.pixels
  } else if (Array.isArray(s.points) && s.points.every((p: unknown) => Array.isArray(p) && p.length === 2)) {
    pixels = rasterizePolyline(s.points as Point[], w, h) // v1: polilinha vetorial -> pixels
  }
  if (!pixels) return null
  return { id: s.id, organ: s.organ, seedling_id: typeof s.seedling_id === 'number' ? s.seedling_id : null, pixels }
}

/** Valida e converte o texto de um .gt.json (v1 vetorial ou v2 em pixels). Lança Error em português. */
export function parseGt(text: string): GtFile {
  let raw: any
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  if (raw?.version !== 1 && raw?.version !== 2) throw new Error('Versão de arquivo não suportada (esperado 1 ou 2).')
  const img = raw.image
  if (!img || !Number.isFinite(img.width) || !Number.isFinite(img.height)) throw new Error('Metadados da imagem ausentes.')
  if (!Array.isArray(raw.strokes)) throw new Error('Lista de traços ausente.')
  const strokes = raw.strokes.map((s: unknown) => normalizeStroke(s, img.width, img.height))
  if (strokes.some((s: Stroke | null) => s === null)) throw new Error('Há traços com formato inválido.')
  return { version: 2, coordinate_system: 'image-pixels-xy-integer', image: img, strokes }
}

const storageKey = (m: ImageMeta) => `gt-annotator:${m.name}:${m.width}x${m.height}`

export function saveDraft(meta: ImageMeta, strokes: Stroke[]): void {
  try {
    localStorage.setItem(storageKey(meta), JSON.stringify(strokes))
  } catch {
    /* armazenamento indisponível: ignora */
  }
}

/** Restaura o rascunho local; rascunhos antigos (vetoriais) são convertidos para pixels. */
export function loadDraft(meta: ImageMeta): Stroke[] | null {
  try {
    const t = localStorage.getItem(storageKey(meta))
    if (!t) return null
    const list = (JSON.parse(t) as unknown[]).map((s) => normalizeStroke(s, meta.width, meta.height))
    return list.filter((s): s is Stroke => s !== null)
  } catch {
    return null
  }
}
