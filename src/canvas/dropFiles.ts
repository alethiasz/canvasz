import { createShapeId, type Editor } from 'tldraw'
import { uploadFile } from '../api'
import { useNodesStore } from '../nodes/store'
import { CARD_FOR_KIND, type CardShape } from './shapes'
import { withoutSync } from './sync'

const GAP = 20

/**
 * Assume o tratamento de arquivos soltos no canvas.
 *
 * O tldraw, por padrão, embute imagens e vídeos como assets dele. Aqui o
 * arquivo vira um nó de verdade — guardado no disco, com registro no banco e
 * visível também no modo arquivo —, e o canvas ganha só o card. É por isso que
 * substituímos o handler em vez de complementá-lo.
 */
export function registerFileDrop(editor: Editor, canvasId: string): void {
  editor.registerExternalContentHandler('files', (info) => {
    void addFilesToCanvas(editor, canvasId, [...info.files], info.point)
  })
}

/** Sobe os arquivos e põe um card de cada um lado a lado a partir do ponto. */
export async function addFilesToCanvas(
  editor: Editor,
  canvasId: string,
  files: File[],
  point?: { x: number; y: number },
): Promise<void> {
  const origin = point ?? editor.getViewportPageBounds().center
  const card = CARD_FOR_KIND.file

  for (const [i, file] of files.entries()) {
    try {
      const { node } = await uploadFile(canvasId, file)
      useNodesStore.getState().upsert(node)

      const id = createShapeId()
      // O nó já existe: criar o card não deve disparar a sincronia de volta.
      withoutSync(() => {
        editor.createShape<CardShape>({
          id,
          type: card.type,
          x: origin.x - card.w / 2 + i * (card.w + GAP),
          y: origin.y - card.h / 2,
          props: { nodeId: node.id, w: card.w, h: card.h },
        })
      })
    } catch (err) {
      console.error(`[canvasz] falha ao subir ${file.name}`, err)
    }
  }
}
