import type { GtFile, ImageMeta, Stroke } from '../types'

export function exportGt(meta: ImageMeta, strokes: Stroke[]): void {
  const data: GtFile = {
    version: 1,
    coordinate_system: 'image-pixels-xy',
    image: meta,
    strokes: strokes.map((s) => ({
      ...s,
      points: s.points.map(([x, y]) => [round2(x), round2(y)]),
    })),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${stem(meta.name)}.gt.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Valida e converte o texto de um arquivo .gt.json. Lança Error com mensagem em português. */
export function parseGt(text: string): GtFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  const d = raw as Partial<GtFile>
  if (d?.version !== 1) throw new Error('Versão de arquivo não suportada (esperado version = 1).')
  if (!d.image || typeof d.image.width !== 'number' || typeof d.image.height !== 'number') {
    throw new Error('Metadados da imagem ausentes.')
  }
  if (!Array.isArray(d.strokes)) throw new Error('Lista de traços ausente.')
  for (const s of d.strokes) {
    const ok =
      typeof s.id === 'string' &&
      (s.organ === 'hipocotilo' || s.organ === 'raiz') &&
      Array.isArray(s.points) &&
      s.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
    if (!ok) throw new Error('Há traços com formato inválido.')
  }
  return d as GtFile
}

const round2 = (n: number) => Math.round(n * 100) / 100
const stem = (name: string) => name.replace(/\.[^.]+$/, '')

const storageKey = (m: ImageMeta) => `gt-annotator:${m.name}:${m.width}x${m.height}`

export function saveDraft(meta: ImageMeta, strokes: Stroke[]): void {
  try {
    localStorage.setItem(storageKey(meta), JSON.stringify(strokes))
  } catch {
    /* armazenamento indisponível: ignora */
  }
}

export function loadDraft(meta: ImageMeta): Stroke[] | null {
  try {
    const t = localStorage.getItem(storageKey(meta))
    return t ? (JSON.parse(t) as Stroke[]) : null
  } catch {
    return null
  }
}
