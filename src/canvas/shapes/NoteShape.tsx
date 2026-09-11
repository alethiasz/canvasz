import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from 'tldraw'
import { useNodesStore } from '../../nodes/store'
import { openDoc } from '../navigation'
import { CardTitle } from './CardTitle'

export const NOTE_SHAPE_TYPE = 'note-card'
export const NOTE_W = 240
export const NOTE_H = 170

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'note-card': { nodeId: string; w: number; h: number }
  }
}

export type NoteCardShape = TLShape<typeof NOTE_SHAPE_TYPE>

/**
 * O card mostra o começo do markdown como texto corrido. Não é um renderizador
 * de markdown: é uma amostra legível, então tiramos só a pontuação que mais
 * atrapalha a leitura em miniatura.
 */
function plainPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '⌗ código')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '🖼')
    .replace(/\[\[([^\][]+)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .trim()
}

function NoteCard({ shape }: { shape: NoteCardShape }) {
  const node = useNodesStore((s) => s.byId[shape.props.nodeId])
  const body = plainPreview(node?.preview ?? '')

  return (
    <HTMLContainer>
      <div className="cz-note" style={{ width: shape.props.w, height: shape.props.h }}>
        <CardTitle nodeId={shape.props.nodeId} className="cz-note__title" />
        <div className="cz-note__body">
          {body || <span className="cz-note__empty">nota vazia</span>}
        </div>
        <span className="cz-note__hint">duplo clique para abrir</span>
      </div>
    </HTMLContainer>
  )
}

export class NoteCardShapeUtil extends BaseBoxShapeUtil<NoteCardShape> {
  static override type = NOTE_SHAPE_TYPE
  static override props = { nodeId: T.string, w: T.number, h: T.number }

  override getDefaultProps(): NoteCardShape['props'] {
    return { nodeId: '', w: NOTE_W, h: NOTE_H }
  }

  /** Editar a nota é trabalho do modo arquivo, não de um campo no canvas. */
  override canEdit(): boolean {
    return false
  }

  override onDoubleClick(shape: NoteCardShape): void {
    openDoc(shape.props.nodeId)
  }

  override component(shape: NoteCardShape) {
    return <NoteCard shape={shape} />
  }

  override getIndicatorPath(shape: NoteCardShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
    return path
  }
}
