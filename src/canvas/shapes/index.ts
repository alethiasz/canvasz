import {
  defaultBindingUtils,
  defaultShapeUtils,
  type TLAnyBindingUtilConstructor,
  type TLAnyShapeUtilConstructor,
  type TLShape,
} from 'tldraw'
import {
  FOLDER_H,
  FOLDER_SHAPE_TYPE,
  FOLDER_W,
  FolderShapeUtil,
  type FolderShape,
} from './FolderShape'
import {
  FILE_H,
  FILE_SHAPE_TYPE,
  FILE_W,
  FileCardShapeUtil,
  type FileCardShape,
} from './FileShape'
import {
  NOTE_H,
  NOTE_SHAPE_TYPE,
  NOTE_W,
  NoteCardShapeUtil,
  type NoteCardShape,
} from './NoteShape'

/**
 * ATENÇÃO: `createTLStore` NÃO mescla os utils padrão — ele só acrescenta o
 * GroupShapeUtil core ao que você passar. Como criamos o store à mão (um
 * documento por pasta), o store e o componente <Tldraw> precisam receber esta
 * lista completa. Passar só os shapes customizados aqui faria o quadro branco
 * perder caneta, setas, formas e texto, silenciosamente.
 */
export const ALL_SHAPE_UTILS: TLAnyShapeUtilConstructor[] = [
  ...defaultShapeUtils,
  FolderShapeUtil,
  NoteCardShapeUtil,
  FileCardShapeUtil,
]

export const ALL_BINDING_UTILS: TLAnyBindingUtilConstructor[] = [...defaultBindingUtils]

/** Como cada tipo de nó vira um card no canvas. */
export const CARD_FOR_KIND = {
  folder: { type: FOLDER_SHAPE_TYPE, w: FOLDER_W, h: FOLDER_H },
  note: { type: NOTE_SHAPE_TYPE, w: NOTE_W, h: NOTE_H },
  file: { type: FILE_SHAPE_TYPE, w: FILE_W, h: FILE_H },
} as const

export type CardShape = FolderShape | NoteCardShape | FileCardShape

const CARD_TYPES = new Set<string>([FOLDER_SHAPE_TYPE, NOTE_SHAPE_TYPE, FILE_SHAPE_TYPE])

/** Shapes que representam um nó (e não um desenho solto do usuário). */
export function cardNodeId(shape: TLShape): string | null {
  if (!CARD_TYPES.has(shape.type)) return null
  const { nodeId } = shape.props as { nodeId?: unknown }
  return typeof nodeId === 'string' && nodeId ? nodeId : null
}
