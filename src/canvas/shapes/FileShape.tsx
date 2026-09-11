import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from 'tldraw'
import { KIND_ICON, fileRawUrl, formatSize, previewKind } from '../../files'
import { useNodesStore } from '../../nodes/store'
import { openDoc } from '../navigation'
import { CardTitle } from './CardTitle'

export const FILE_SHAPE_TYPE = 'file-card'
export const FILE_W = 200
export const FILE_H = 160

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'file-card': { nodeId: string; w: number; h: number }
  }
}

export type FileCardShape = TLShape<typeof FILE_SHAPE_TYPE>

function FileCard({ shape }: { shape: FileCardShape }) {
  const node = useNodesStore((s) => s.byId[shape.props.nodeId])
  const name = node?.title.trim() || 'arquivo'
  const kind = previewKind(node?.mime)

  return (
    <HTMLContainer>
      <div className="cz-file" style={{ width: shape.props.w, height: shape.props.h }}>
        <div className="cz-file__thumb">
          {kind === 'image' ? (
            // Miniatura de verdade: é o que faz o canvas valer a pena para imagens.
            <img src={fileRawUrl(shape.props.nodeId)} alt={name} draggable={false} />
          ) : (
            <span className="cz-file__icon">{KIND_ICON[kind]}</span>
          )}
        </div>
        <div className="cz-file__foot">
          <CardTitle nodeId={shape.props.nodeId} className="cz-file__name" placeholder="arquivo" />
          <span className="cz-file__meta">
            {formatSize(node?.size)}
            {node?.mime && kind === 'other' ? ` · ${node.mime.split('/').pop()}` : ''}
          </span>
        </div>
      </div>
    </HTMLContainer>
  )
}

export class FileCardShapeUtil extends BaseBoxShapeUtil<FileCardShape> {
  static override type = FILE_SHAPE_TYPE
  static override props = { nodeId: T.string, w: T.number, h: T.number }

  override getDefaultProps(): FileCardShape['props'] {
    return { nodeId: '', w: FILE_W, h: FILE_H }
  }

  override canEdit(): boolean {
    return false
  }

  /** Ver o arquivo inteiro (tocar o vídeo, ler o PDF) é no modo arquivo. */
  override onDoubleClick(shape: FileCardShape): void {
    openDoc(shape.props.nodeId)
  }

  override component(shape: FileCardShape) {
    return <FileCard shape={shape} />
  }

  override getIndicatorPath(shape: FileCardShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
    return path
  }
}
