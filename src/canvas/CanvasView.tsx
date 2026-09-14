import { useEffect, useState } from 'react'
import {
  Tldraw,
  createTLStore,
  loadSnapshot,
  type Editor,
  type TLSessionStateSnapshot,
  type TLStore,
  type TLStoreSnapshot,
} from 'tldraw'
import { deleteNode, getCanvas, listNodes, updateNode, type CanvasNode } from '../api'
import { useNodesStore } from '../nodes/store'
import { EmptyHint } from './EmptyHint'
import { StylePanelSobDemanda } from './StylePanelSobDemanda'
import { registerFileDrop } from './dropFiles'
import { loadSession, useCanvasPersistence } from './persistence'
import { reconcileCanvas } from './reconcile'
import { ALL_BINDING_UTILS, ALL_SHAPE_UTILS, cardNodeId } from './shapes'
import { isSyncSuppressed } from './sync'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; store: TLStore; nodes: CanvasNode[]; temSessao: boolean }

/**
 * O tldraw traz um seletor de páginas próprio. Aqui ele não só confunde — quem
 * navega entre contextos são as pastas — como é perigoso: shapes criados numa
 * segunda página ficariam fora do `getCurrentPageShapes()` que a reconciliação
 * enxerga, ou seja, desenhos sumindo sem explicação.
 */
const TLDRAW_COMPONENTS = { PageMenu: null, StylePanel: StylePanelSobDemanda }

const newStore = () =>
  createTLStore({ shapeUtils: ALL_SHAPE_UTILS, bindingUtils: ALL_BINDING_UTILS })

/**
 * Monta o store de um canvas. A sessão (câmera) é descartável, então uma sessão
 * corrompida é ignorada em vez de derrubar o documento. Já um documento que não
 * carrega vira erro de propósito: melhor um canvas inacessível e reparável do
 * que um canvas vazio que a próxima edição sobrescreve por cima do original.
 */
function buildStore(
  snapshot: TLStoreSnapshot | null,
  session: TLSessionStateSnapshot | undefined,
): TLStore {
  if (!snapshot) return newStore()

  if (session) {
    try {
      const store = newStore()
      loadSnapshot(store, { document: snapshot, session })
      return store
    } catch (err) {
      console.warn('[canvasz] sessão salva ignorada (incompatível)', err)
    }
  }

  try {
    const store = newStore()
    loadSnapshot(store, { document: snapshot })
    return store
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`snapshot incompatível ou corrompido — nada foi sobrescrito (${detail})`)
  }
}

/**
 * Mantém os nós em dia com o que o usuário faz no canvas: apagar um card manda
 * a pasta para a lixeira, e desfazer o apagamento traz a pasta de volta.
 */
function registerNodeSync(editor: Editor): () => void {
  const { remove, upsert } = useNodesStore.getState()

  const stopDelete = editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
    const nodeId = isSyncSuppressed() ? null : cardNodeId(shape)
    if (nodeId === null) return
    remove(nodeId)
    void deleteNode(nodeId).catch((err) => console.error('[canvasz] falha ao apagar nó', err))
  })

  const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape) => {
    const nodeId = isSyncSuppressed() ? null : cardNodeId(shape)
    if (nodeId === null) return
    // Chega aqui quando o usuário desfaz um apagamento: o card volta, e o nó
    // precisa sair da lixeira junto.
    void updateNode(nodeId, { restore: true })
      .then(({ node }) => upsert(node))
      .catch((err) => console.error('[canvasz] falha ao restaurar nó', err))
  })

  return () => {
    stopDelete()
    stopCreate()
  }
}

/**
 * Leva a vista até um card específico. É o que faz um resultado de busca
 * terminar no lugar certo, e não só na pasta certa.
 */
function revealCard(editor: Editor, nodeId: string): void {
  const shape = editor.getCurrentPageShapes().find((s) => cardNodeId(s) === nodeId)
  if (!shape) return
  editor.select(shape.id)
  editor.zoomToSelection({ animation: { duration: 300 } })
  // Sem foco no editor o tldraw não desenha o contorno da seleção, e o card
  // chegaria enquadrado mas sem indicação nenhuma de que é aquele.
  editor.focus()
}

export function CanvasView({
  canvasId,
  revealNodeId,
  onEditorChange,
  aoCriar,
}: {
  canvasId: string
  revealNodeId?: string
  onEditorChange: (editor: Editor | null) => void
  aoCriar: (kind: 'folder' | 'note') => void
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [editor, setEditor] = useState<Editor | null>(null)

  // Cada pasta é um documento tldraw próprio: trocar de canvas descarta o
  // store atual e monta outro com o snapshot daquela pasta.
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    setEditor(null)
    onEditorChange(null)

    void (async () => {
      try {
        const [{ snapshot }, { nodes }] = await Promise.all([
          getCanvas(canvasId),
          listNodes(canvasId),
        ])
        if (cancelled) return
        useNodesStore.getState().setAll(nodes)
        const sessao = loadSession(canvasId)
        setState({
          status: 'ready',
          store: buildStore(snapshot, sessao),
          nodes,
          temSessao: sessao !== undefined,
        })
      } catch (err) {
        if (cancelled) return
        console.error('[canvasz] falha ao carregar canvas', err)
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canvasId, onEditorChange])

  useCanvasPersistence(editor, canvasId)

  if (state.status === 'loading') return <div className="cz-fallback">carregando canvas…</div>
  if (state.status === 'error') {
    return (
      <div className="cz-fallback cz-fallback--error">
        não foi possível carregar o canvas
        <code>{state.message}</code>
      </div>
    )
  }

  return (
    <Tldraw
      key={canvasId}
      store={state.store}
      shapeUtils={ALL_SHAPE_UTILS}
      bindingUtils={ALL_BINDING_UTILS}
      components={TLDRAW_COMPONENTS}
      onMount={(mounted) => {
        // Reconciliar antes de escutar: os ajustes de reconciliação não podem
        // ser confundidos com ações do usuário.
        const criouCards = reconcileCanvas(mounted, state.nodes)
        if (revealNodeId) {
          // Depois de reconciliar: o card procurado pode ter acabado de nascer.
          revealCard(mounted, revealNodeId)
        } else if (criouCards && !state.temSessao) {
          // Sem câmera salva a vista começa em (0,0), bem embaixo da barra de
          // ferramentas do tldraw, que escondia os primeiros cards. Enquadrar
          // resolve isso e ainda mostra tudo que há na pasta.
          mounted.zoomToFit({ animation: { duration: 200 } })
        }
        registerFileDrop(mounted, canvasId)
        const stopSync = registerNodeSync(mounted)
        setEditor(mounted)
        onEditorChange(mounted)
        return () => {
          stopSync()
          onEditorChange(null)
        }
      }}
    >
      <EmptyHint aoCriar={aoCriar} />
    </Tldraw>
  )
}
