import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ROOT_CANVAS,
  createNode,
  getFile,
  getNote,
  getPath,
  getTree,
  putNote,
  updateNode,
  uploadFile,
  type TreeNode,
} from '../api'
import { fileMarkdown, type FileMeta } from '../files'
import { SaveIndicator } from '../ui/SaveIndicator'
import { marcarErro, marcarSalvando, marcarSalvo } from '../ui/saveStatus'
import { notificar } from '../ui/toasts'
import { FilePreview } from './FilePreview'
import { Tree } from './Tree'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownPreview } from './MarkdownPreview'

const SAVE_DEBOUNCE_MS = 500

type ViewMode = 'editar' | 'dividido' | 'ler'

type DocState =
  | { status: 'vazio' }
  | { status: 'carregando' }
  | { status: 'erro'; message: string }
  | { status: 'nota'; markdown: string; title: string; parentId: string | null }
  | { status: 'arquivo'; file: FileMeta; title: string; parentId: string | null }

export function DocsScreen({ nodeId }: { nodeId?: string }) {
  const navigate = useNavigate()
  const [tree, setTree] = useState<TreeNode[]>([])
  const [note, setNote] = useState<DocState>({ status: 'vazio' })
  // O que está na tela agora. Precisa ser estado, não ref: o preview lado a
  // lado tem que reagir a cada tecla, e mutar um ref não re-renderiza nada.
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<ViewMode>('dividido')

  const [trilha, setTrilha] = useState<string[]>([])

  const refreshTree = useCallback(() => {
    void getTree()
      .then(({ tree: t }) => setTree(t))
      .catch((err) => notificar.erro('Não consegui carregar a lista de notas.', err))
  }, [])

  // Recarrega ao trocar de nota também: uma nota criada por wikilink precisa
  // aparecer na barra lateral assim que abre.
  useEffect(() => refreshTree(), [refreshTree, nodeId])

  // Salvamento pendente: precisa sobreviver à troca de nota e ao desmonte.
  const pending = useRef<{ id: string; markdown: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    const job = pending.current
    if (!job) return
    pending.current = null
    marcarSalvando()
    void putNote(job.id, job.markdown)
      .then(() => {
        marcarSalvo()
        refreshTree()
      })
      .catch((err) => {
        marcarErro()
        notificar.erro('Não consegui salvar a nota. O texto continua aqui na tela.', err)
      })
  }, [refreshTree])

  useEffect(() => {
    const onLeave = () => flush()
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      flush()
    }
  }, [flush])

  useEffect(() => {
    let cancelled = false
    // Trocar de nota não pode engolir o que ainda não foi salvo.
    flush()

    if (!nodeId) {
      setNote({ status: 'vazio' })
      return
    }
    setNote({ status: 'carregando' })

    // A trilha já diz o tipo do nó, então uma requisição decide o que carregar.
    void getPath(nodeId)
      .then(async ({ path }) => {
        if (cancelled) return
        const self = path[path.length - 1]
        const parent = path.length > 1 ? path[path.length - 2]!.id : null
        // A trilha diz onde o documento mora: sem ela, duas notas de mesmo
        // nome em pastas diferentes eram indistinguíveis.
        setTrilha(path.slice(0, -1).map((p) => p.title.trim() || 'Sem título'))

        if (self?.kind === 'file') {
          const { file } = await getFile(nodeId)
          if (cancelled) return
          setNote({ status: 'arquivo', file, title: self.title, parentId: parent })
          return
        }

        const { markdown, title } = await getNote(nodeId)
        if (cancelled) return
        setNote({ status: 'nota', markdown, title, parentId: parent })
        setDraft(markdown)
      })
      .catch((err) => {
        if (cancelled) return
        setNote({ status: 'erro', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [nodeId, flush])

  function handleChange(markdown: string) {
    if (!nodeId) return
    setDraft(markdown)
    pending.current = { id: nodeId, markdown }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }

  /** Anexa arquivos no corpo da nota, do jeito que cada formato pede. */
  async function handleAttach(files: File[]): Promise<string> {
    if (note.status !== 'nota') return ''
    const parent = note.parentId ?? ROOT_CANVAS
    const parts: string[] = []
    for (const file of files) {
      try {
        const { node } = await uploadFile(parent, file)
        parts.push(fileMarkdown(node.id, file.name, node.mime ?? ''))
      } catch (err) {
        notificar.erro(`Não consegui anexar "${file.name}".`, err)
      }
    }
    refreshTree()
    return parts.length ? `\n\n${parts.join('\n\n')}\n\n` : ''
  }

  async function handleRename(title: string) {
    if (!nodeId || note.status === 'vazio' || note.status === 'carregando' || note.status === 'erro') return
    if (title === note.title) return
    try {
      await updateNode(nodeId, { title })
      setNote({ ...note, title })
      refreshTree()
    } catch (err) {
      notificar.erro('Não consegui renomear.', err)
    }
  }

  async function handleMove(nodeId: string, parent: string) {
    try {
      await updateNode(nodeId, { parent })
      refreshTree()
    } catch (err) {
      const ciclo = err instanceof Error && err.message.includes('409')
      notificar.erro(
        ciclo ? 'Uma pasta não pode ser movida para dentro dela mesma.' : 'Não consegui mover.',
        err,
      )
    }
  }

  async function handleNewNote() {
    const parent = 'parentId' in note ? (note.parentId ?? ROOT_CANVAS) : ROOT_CANVAS
    try {
      const { node } = await createNode(parent, 'note', 'Nova nota')
      refreshTree()
      navigate(`/doc/${node.id}`)
    } catch (err) {
      notificar.erro('Não consegui criar a nota.', err)
    }
  }

  const canvasTarget = 'parentId' in note ? (note.parentId ?? ROOT_CANVAS) : ROOT_CANVAS

  return (
    <div className="cz-app">
      <header className="cz-topbar">
        <span className="cz-brand">canvasz</span>
        <span className="cz-modeswitch">
          <button type="button" className="cz-button" onClick={() => navigate(`/canvas/${canvasTarget}`)}>
            ▦ modo canvas
          </button>
          <span className="cz-modeswitch__current">modo arquivo</span>
        </span>

        {trilha.length > 0 && (
          <span className="cz-docpath" title={trilha.join(' › ')}>
            {trilha.join(' › ')}
          </span>
        )}
        <SaveIndicator />

        <div className="cz-actions">
          {note.status === 'nota' && (
            <span className="cz-viewmode">
              {(['editar', 'dividido', 'ler'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`cz-button${mode === m ? ' cz-button--primary' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
            </span>
          )}
          <button type="button" className="cz-button" title="Lixeira" onClick={() => navigate('/lixeira')}>
            🗑
          </button>
          <button type="button" className="cz-button cz-button--primary" onClick={handleNewNote}>
            + nova nota
          </button>
        </div>
      </header>

      <div className="cz-docs">
        <aside
          className="cz-sidebar"
          // Soltar na área vazia da barra lateral move para a raiz.
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/canvasz-node')) e.preventDefault()
          }}
          onDrop={(e) => {
            const dragged = e.dataTransfer.getData('text/canvasz-node')
            if (dragged) void handleMove(dragged, ROOT_CANVAS)
          }}
        >
          {tree.length === 0 ? (
            <p className="cz-sidebar__empty">
              Nada aqui ainda. Crie sua primeira nota com <b>+ nova nota</b>.
            </p>
          ) : (
            <Tree
              nodes={tree}
              activeId={nodeId}
              onOpen={(node) =>
                navigate(node.kind === 'folder' ? `/canvas/${node.id}` : `/doc/${node.id}`)
              }
              onMove={handleMove}
            />
          )}
        </aside>

        <section className="cz-doc">
          {note.status === 'vazio' && (
            <div className="cz-fallback cz-fallback--vazio">
              {tree.length === 0 ? (
                <>
                  <p>Nenhuma nota ainda.</p>
                  <button type="button" className="cz-button cz-button--primary" onClick={handleNewNote}>
                    Criar a primeira nota
                  </button>
                </>
              ) : (
                <p>Escolha uma nota na barra lateral.</p>
              )}
            </div>
          )}
          {note.status === 'carregando' && <div className="cz-fallback">carregando nota…</div>}
          {note.status === 'erro' && (
            <div className="cz-fallback cz-fallback--error">
              não foi possível abrir a nota
              <code>{note.message}</code>
            </div>
          )}
          {(note.status === 'nota' || note.status === 'arquivo') && (
            <>
              <input
                className="cz-doc__title"
                defaultValue={note.title}
                key={`${nodeId}-title`}
                placeholder="Sem título"
                onBlur={(e) => handleRename(e.currentTarget.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
              {note.status === 'arquivo' ? (
                <FilePreview file={note.file} />
              ) : (
                <div className={`cz-panes cz-panes--${mode}`}>
                  {mode !== 'ler' && (
                    <MarkdownEditor
                      key={nodeId}
                      initialValue={note.markdown}
                      onChange={handleChange}
                      onFiles={handleAttach}
                    />
                  )}
                  {mode !== 'editar' && (
                    <MarkdownPreview markdown={draft} parentId={note.parentId} />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
