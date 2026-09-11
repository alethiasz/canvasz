import { create } from 'zustand'
import type { Editor, TLShape, TLShapeId } from 'tldraw'
import { updateNode } from '../api'
import { useNodesStore } from '../nodes/store'
import { cardNodeId } from './shapes'
import { withoutSync } from './sync'

type DropTargetState = {
  /** nodeId da pasta sob o card sendo arrastado, para destacá-la. */
  hovered: string | null
  setHovered: (nodeId: string | null) => void
}

export const useDropTarget = create<DropTargetState>((set) => ({
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
}))

/**
 * Move cards para dentro de uma pasta.
 *
 * Mover não é reparentar shapes: cada pasta é um documento tldraw separado, então
 * o item passa a viver no canvas da pasta e o card **sai** deste canvas. Por isso
 * a remoção roda com a sincronia suspensa — sem isso o handler de exclusão
 * mandaria o nó recém-movido para a lixeira.
 *
 * A remoção também fica fora do histórico de propósito: desfazer só recriaria o
 * card aqui, sem desfazer a mudança de pasta no servidor, e as duas metades
 * ficariam divergentes.
 */
export async function moveCardsInto(
  editor: Editor,
  targetNodeId: string,
  shapes: TLShape[],
): Promise<void> {
  const candidates = shapes
    .map((shape) => ({ shape, nodeId: cardNodeId(shape) }))
    .filter((c): c is { shape: TLShape; nodeId: string } =>
      c.nodeId !== null && c.nodeId !== targetNodeId,
    )
  if (candidates.length === 0) return

  const { remove, upsert, byId } = useNodesStore.getState()
  const movedShapeIds: TLShapeId[] = []

  for (const { shape, nodeId } of candidates) {
    try {
      await updateNode(nodeId, { parent: targetNodeId })
      movedShapeIds.push(shape.id)
      remove(nodeId)
    } catch (err) {
      // Mover uma pasta para dentro dela mesma volta 409 — o servidor recusa e
      // o card simplesmente fica onde estava.
      console.error('[canvasz] não deu para mover o item', err)
    }
  }

  if (movedShapeIds.length === 0) return

  const target = byId[targetNodeId]
  if (target) upsert({ ...target, child_count: target.child_count + movedShapeIds.length })

  withoutSync(() => {
    editor.run(() => editor.deleteShapes(movedShapeIds), { history: 'ignore' })
  })
}
