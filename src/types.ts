export type Organ = 'hipocotilo' | 'raiz'
export type Point = [number, number] // [x, y] em pixels da imagem original
export type Tool = 'freehand' | 'draw' | 'pan' | 'select'

export interface Stroke {
  id: string
  organ: Organ
  /** Plântula à qual o traço pertence (hipocótilo e raiz da mesma plântula compartilham o id). */
  seedling_id: number | null
  /** Polilinha do eixo do órgão, ordenada do colo para o ápice (convenção a definir no protocolo). */
  points: Point[]
}

export interface ImageMeta {
  name: string
  width: number
  height: number
}

/** Formato do arquivo exportado/importado. */
export interface GtFile {
  version: 1
  coordinate_system: 'image-pixels-xy'
  image: ImageMeta
  strokes: Stroke[]
}

export const ORGANS: { key: Organ; label: string; color: string; hotkey: string }[] = [
  { key: 'hipocotilo', label: 'Hipocótilo', color: '#00e5ff', hotkey: '1' },
  { key: 'raiz', label: 'Raiz', color: '#ffd400', hotkey: '2' },
]

export const organColor = (o: Organ) => ORGANS.find((x) => x.key === o)!.color
export const organLabel = (o: Organ) => ORGANS.find((x) => x.key === o)!.label
