import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from 'tldraw'
import { useNodesStore } from '../../nodes/store'
import { moveCardsInto, useDropTarget } from '../moveNodes'
import { openCanvas } from '../navigation'
import { CardTitle } from './CardTitle'

export const FOLDER_SHAPE_TYPE = 'folder'
export const FOLDER_W = 220
export const FOLDER_H = 132

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    folder: { nodeId: string; w: number; h: number }
  }
}

export type FolderShape = TLShape<typeof FOLDER_SHAPE_TYPE>

function FolderCard({ shape }: { shape: FolderShape }) {
  const node = useNodesStore((s) => s.byId[shape.props.nodeId])
  const isDropTarget = useDropTarget((s) => s.hovered === shape.props.nodeId)
  const count = node?.child_count ?? 0

  return (
    <HTMLContainer>
      <div
        className={`cz-folder${isDropTarget ? ' cz-folder--drop' : ''}`}
        style={{ width: shape.props.w, height: shape.props.h }}
      >
        <div className="cz-folder__tab" />
        <div className="cz-folder__body">
          <CardTitle nodeId={shape.props.nodeId} className="cz-folder__title" />
          <span className="cz-folder__meta">
            {count === 0 ? 'vazia' : count === 1 ? '1 item' : `${count} itens`}
          </span>
        </div>

        <span className="cz-folder__hint">
          {isDropTarget ? 'soltar para mover para cá' : 'duplo clique para abrir'}
        </span>
      </div>
    </HTMLContainer>
  )
}

export class FolderShapeUtil extends BaseBoxShapeUtil<FolderShape> {
  static override type = FOLDER_SHAPE_TYPE
  static override props = { nodeId: T.string, w: T.number, h: T.number }

  override getDefaultProps(): FolderShape['props'] {
    return { nodeId: '', w: FOLDER_W, h: FOLDER_H }
  }

  /** Duplo clique não edita o card: ele entra na pasta. */
  override canEdit(): boolean {
    return false
  }

  override onDoubleClick(shape: FolderShape): void {
    openCanvas(shape.props.nodeId)
  }

  /**
   * O tldraw só oferece o drop a shapes que declaram receber filhos, e o padrão
   * do `ShapeUtil` é `false` — só os frames dizem sim. Sem isto os callbacks de
   * arrastar/soltar nunca disparam, em silêncio.
   */
  override canReceiveNewChildrenOfType(): boolean {
    return true
  }

  /** Destaca a pasta enquanto um card paira sobre ela. */
  override onDragShapesIn(shape: FolderShape): void {
    useDropTarget.getState().setHovered(shape.props.nodeId)
  }

  override onDragShapesOut(): void {
    useDropTarget.getState().setHovered(null)
  }

  /** Soltar um card sobre a pasta move o item para dentro dela. */
  override onDropShapesOver(shape: FolderShape, shapes: TLShape[]): void {
    useDropTarget.getState().setHovered(null)
    void moveCardsInto(this.editor, shape.props.nodeId, shapes)
  }

  override component(shape: FolderShape) {
    return <FolderCard shape={shape} />
  }

  override getIndicatorPath(shape: FolderShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
    return path
  }
}
