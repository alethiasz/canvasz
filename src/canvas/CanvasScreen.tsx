import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createShapeId, type Editor } from 'tldraw'
import { ROOT_CANVAS, createNode, exportUrl, getPath, type PathSegment } from '../api'
import { useNodesStore } from '../nodes/store'
import { CanvasView } from './CanvasView'
import { addFilesToCanvas } from './dropFiles'
import { setNavigator } from './navigation'
import { CARD_FOR_KIND } from './shapes'
import { nomearAoCriar } from './shapes/CardTitle'
import { notificar } from '../ui/toasts'
import { withoutSync } from './sync'

export function CanvasScreen({ canvasId }: { canvasId: string }) {
  const navigate = useNavigate()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [path, setPath] = useState<PathSegment[]>([])
  const filePicker = useRef<HTMLInputElement>(null)
  // A busca navega com `?reveal=<id>` para enquadrar o card do resultado.
  const [searchParams] = useSearchParams()
  const revealNodeId = searchParams.get('reveal') ?? undefined

  const openCanvasId = useCallback((id: string) => navigate(`/canvas/${id}`), [navigate])

  // O duplo clique num card acontece dentro do ShapeUtil, fora do React;
  // é por aqui que ele chega ao roteador.
  useEffect(() => setNavigator((to) => navigate(to)), [navigate])

  useEffect(() => {
    let cancelled = false
    if (canvasId === ROOT_CANVAS) {
      setPath([])
      return
    }
    void getPath(canvasId)
      .then(({ path: segments }) => !cancelled && setPath(segments))
      .catch((err) => notificar.erro('Não consegui carregar a trilha de pastas.', err))
    return () => {
      cancelled = true
    }
  }, [canvasId])

  async function addCard(kind: 'folder' | 'note') {
    if (!editor) return
    const card = CARD_FOR_KIND[kind]
    try {
      const { node } = await createNode(canvasId, kind, kind === 'folder' ? 'Nova pasta' : 'Nova nota')
      useNodesStore.getState().upsert(node)
      // O card nasce com o nome já selecionado: é só digitar.
      nomearAoCriar(node.id)

      const center = editor.getViewportPageBounds().center
      const id = createShapeId()
      // O nó já existe no banco; criar o card não deve disparar a sincronia.
      withoutSync(() => {
        editor.createShape({
          id,
          type: card.type,
          x: center.x - card.w / 2,
          y: center.y - card.h / 2,
          props: { nodeId: node.id, w: card.w, h: card.h },
        })
      })
      editor.select(id)
    } catch (err) {
      notificar.erro(`Não consegui criar a ${kind === 'folder' ? 'pasta' : 'nota'}.`, err)
    }
  }

  const parentId = path.length > 1 ? path[path.length - 2]!.id : ROOT_CANVAS
  const atRoot = canvasId === ROOT_CANVAS

  // Alt+↑ sobe um nível. Alt evita conflito com os atalhos de uma tecla só
  // do tldraw, que ocupam praticamente o alfabeto inteiro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowUp' && !atRoot) {
        e.preventDefault()
        openCanvasId(parentId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [atRoot, parentId, openCanvasId])

  return (
    <div className="cz-app">
      <header className="cz-topbar">
        <span className="cz-brand">canvasz</span>

        <nav className="cz-crumbs" aria-label="Trilha de pastas">
          <button
            type="button"
            className="cz-crumb"
            disabled={atRoot}
            onClick={() => openCanvasId(ROOT_CANVAS)}
          >
            raiz
          </button>
          {path.map((segment, i) => (
            <span className="cz-crumbs__item" key={segment.id}>
              <span className="cz-crumbs__sep">›</span>
              <button
                type="button"
                className="cz-crumb"
                disabled={i === path.length - 1}
                onClick={() => openCanvasId(segment.id)}
              >
                {segment.title.trim() || 'Sem título'}
              </button>
            </span>
          ))}
        </nav>

        <div className="cz-actions">
          {!atRoot && (
            <button
              type="button"
              className="cz-button"
              title="Alt+↑"
              onClick={() => openCanvasId(parentId)}
            >
              ↑ subir
            </button>
          )}
          <a
            className="cz-button"
            href={exportUrl(canvasId)}
            title={atRoot ? 'Baixar tudo como .zip' : 'Baixar esta pasta como .zip'}
          >
            ↓ exportar
          </a>
          <button type="button" className="cz-button" title="Lixeira" onClick={() => navigate('/lixeira')}>
            🗑
          </button>
          <button type="button" className="cz-button" onClick={() => navigate('/doc')}>
            ▤ modo arquivo
          </button>
          <button
            type="button"
            className="cz-button cz-button--primary"
            onClick={() => addCard('folder')}
            disabled={!editor}
          >
            + pasta
          </button>
          <button
            type="button"
            className="cz-button cz-button--primary"
            onClick={() => addCard('note')}
            disabled={!editor}
          >
            + nota
          </button>
          <button
            type="button"
            className="cz-button cz-button--primary"
            onClick={() => filePicker.current?.click()}
            disabled={!editor}
            title="Qualquer formato — ou arraste os arquivos para o canvas"
          >
            + arquivo
          </button>
          <input
            ref={filePicker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const chosen = [...(e.currentTarget.files ?? [])]
              e.currentTarget.value = ''
              if (editor && chosen.length > 0) void addFilesToCanvas(editor, canvasId, chosen)
            }}
          />
        </div>
      </header>

      <main className="cz-stage">
        <CanvasView
          canvasId={canvasId}
          revealNodeId={revealNodeId}
          onEditorChange={setEditor}
          aoCriar={addCard}
        />
      </main>
    </div>
  )
}
