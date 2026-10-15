export type Organ = 'hipocotilo' | 'raiz'
export type Point = [number, number] // posição contínua [x, y] na imagem (para o cursor)
export type Pixel = [number, number] // pixel inteiro [x, y] da imagem original
export type Tool = 'freehand' | 'draw' | 'erase' | 'pan' | 'select'

export interface Stroke {
  id: string
  organ: Organ
  /** Plântula à qual o traço pertence (hipocótilo e raiz da mesma plântula compartilham o id). */
  seedling_id: number | null
  /**
   * Esqueleto desenhado, como cadeia ordenada de pixels inteiros, 8-conexa e sem pixels redundantes
   * (mesma natureza da saída dos algoritmos de esqueletização). Ordem: do colo para o ápice (a definir no protocolo).
   */
  pixels: Pixel[]
}

/** Camada de imagem (original, máscara, etc.). A ordem no array é de baixo para cima. */
export interface Layer {
  id: string
  name: string
  url: string
  img: HTMLImageElement
  width: number
  height: number
  visible: boolean
  opacity: number // 0–1
}

export interface ImageMeta {
  name: string
  width: number
  height: number
}

/** Formato do arquivo exportado/importado. */
export interface GtFile {
  version: 2
  coordinate_system: 'image-pixels-xy-integer'
  image: ImageMeta
  strokes: Stroke[]
}

export const ORGANS: { key: Organ; label: string; color: string; hotkey: string }[] = [
  { key: 'hipocotilo', label: 'Hipocótilo', color: '#00e5ff', hotkey: '1' },
  { key: 'raiz', label: 'Raiz', color: '#ffd400', hotkey: '2' },
]

export const organColor = (o: Organ) => ORGANS.find((x) => x.key === o)!.color
export const organLabel = (o: Organ) => ORGANS.find((x) => x.key === o)!.label
