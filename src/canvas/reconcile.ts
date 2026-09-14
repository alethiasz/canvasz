import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import type { CanvasNode } from '../api'
import { CARD_FOR_KIND, cardNodeId, type CardShape } from './shapes'
import { withoutSync } from './sync'

const GAP = 40
const COLUMNS = 4

/**
 * A grade usa um passo único, e não a largura de cada card.
 *
 * Pasta, nota e arquivo têm tamanhos diferentes; avançar a coluna pela largura
 * do card atual desalinhava as colunas e fazia os cards se sobreporem quando
 * uma pasta caía ao lado de uma nota.
 */
const PASSO_X = Math.max(...Object.values(CARD_FOR_KIND).map((c) => c.w)) + GAP
const PASSO_Y = Math.max(...Object.values(CARD_FOR_KIND).map((c) => c.h)) + GAP

/**
 * Casa o canvas com o banco ao abrir uma pasta.
 *
 * O registro em `nodes` é a verdade sobre existência e hierarquia; o snapshot
 * tldraw é a verdade sobre posição e aparência. Isso significa que um card pode
 * sobrar (o nó foi apagado em outro lugar) ou faltar (o nó nasceu fora deste
 * canvas). Aqui os dois lados voltam a bater — sem tocar em nada que o usuário
 * tenha desenhado à mão.
 */
export function reconcileCanvas(editor: Editor, nodes: CanvasNode[]): boolean {
  const byNodeId = new Map(nodes.map((n) => [n.id, n]))

  const seen = new Set<string>()
  const orphans: TLShapeId[] = []

  for (const shape of editor.getCurrentPageShapes()) {
    const nodeId = cardNodeId(shape)
    if (nodeId === null) continue
    // Órfão: nó inexistente, ou um segundo card para um nó que já tem um.
    if (!byNodeId.has(nodeId) || seen.has(nodeId)) orphans.push(shape.id)
    else seen.add(nodeId)
  }

  const missing = nodes.filter((n) => n.kind in CARD_FOR_KIND && !seen.has(n.id))
  if (orphans.length === 0 && missing.length === 0) return false

  // Os cards novos entram numa grade abaixo do que já existe, para não cair
  // por cima de desenhos.
  const bounds = editor.getCurrentPageBounds()
  const startX = bounds ? bounds.minX : 0
  const startY = bounds ? bounds.maxY + GAP : 0

  withoutSync(() => {
    editor.run(
      () => {
        if (orphans.length > 0) editor.deleteShapes(orphans)
        if (missing.length > 0) {
          editor.createShapes<CardShape>(
            missing.map((node, i) => {
              const card = CARD_FOR_KIND[node.kind as keyof typeof CARD_FOR_KIND]
              return {
                id: createShapeId(),
                type: card.type,
                x: startX + (i % COLUMNS) * PASSO_X,
                y: startY + Math.floor(i / COLUMNS) * PASSO_Y,
                props: { nodeId: node.id, w: card.w, h: card.h },
              }
            }),
          )
        }
      },
      { history: 'ignore' },
    )
  })

  // Diz se nasceram cards agora: quem chamou pode querer enquadrar a vista.
  return missing.length > 0
}
