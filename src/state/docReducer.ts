import type { Stroke } from '../types'

export interface DocState {
  strokes: Stroke[]
  past: Stroke[][]
  future: Stroke[][]
}

export type DocAction =
  /** Substitui tudo e zera o histórico (nova imagem / importação). */
  | { type: 'reset'; strokes: Stroke[] }
  /** Aplica mudança e registra no histórico (undo/redo). */
  | { type: 'commit'; strokes: Stroke[] }
  /** Salva o estado atual no histórico sem alterá-lo (início de um arraste). */
  | { type: 'checkpoint' }
  /** Aplica mudança sem registrar (movimentos intermediários de um arraste). */
  | { type: 'set'; strokes: Stroke[] }
  | { type: 'undo' }
  | { type: 'redo' }

const MAX_HISTORY = 200

export const initialDoc: DocState = { strokes: [], past: [], future: [] }

export function docReducer(state: DocState, action: DocAction): DocState {
  switch (action.type) {
    case 'reset':
      return { strokes: action.strokes, past: [], future: [] }
    case 'commit':
      return {
        strokes: action.strokes,
        past: [...state.past, state.strokes].slice(-MAX_HISTORY),
        future: [],
      }
    case 'checkpoint':
      return { ...state, past: [...state.past, state.strokes].slice(-MAX_HISTORY), future: [] }
    case 'set':
      return { ...state, strokes: action.strokes }
    case 'undo': {
      if (state.past.length === 0) return state
      const prev = state.past[state.past.length - 1]
      return { strokes: prev, past: state.past.slice(0, -1), future: [state.strokes, ...state.future] }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const [next, ...rest] = state.future
      return { strokes: next, past: [...state.past, state.strokes], future: rest }
    }
  }
}
