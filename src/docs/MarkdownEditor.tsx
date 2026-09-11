import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

/**
 * O editor é montado uma vez por nota (a tela usa `key={noteId}`), então não
 * precisa sincronizar o valor de fora — o que evita a briga clássica entre o
 * estado do React e o documento do CodeMirror enquanto se digita.
 */
export function MarkdownEditor({
  initialValue,
  onChange,
  onFiles,
}: {
  initialValue: string
  onChange: (value: string) => void
  /** Recebe arquivos soltos ou colados e devolve o markdown a inserir. */
  onFiles?: (files: File[]) => Promise<string>
}) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onFilesRef = useRef(onFiles)
  onFilesRef.current = onFiles

  useEffect(() => {
    if (!host.current) return

    const view = new EditorView({
      doc: initialValue,
      parent: host.current,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          drop(event, view) {
            const files = [...(event.dataTransfer?.files ?? [])]
            if (files.length === 0 || !onFilesRef.current) return false
            event.preventDefault()
            const at = view.posAtCoords({ x: event.clientX, y: event.clientY })
            void insertFiles(view, files, at ?? view.state.selection.main.head)
            return true
          },
          paste(event, view) {
            const files = [...(event.clipboardData?.files ?? [])]
            if (files.length === 0 || !onFilesRef.current) return false
            event.preventDefault()
            void insertFiles(view, files, view.state.selection.main.head)
            return true
          },
        }),
      ],
    })

    return () => view.destroy()
    // Recriar o editor a cada tecla seria absurdo: o valor inicial é lido só
    // na montagem, de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function insertFiles(view: EditorView, files: File[], at: number) {
    const handler = onFilesRef.current
    if (!handler) return
    try {
      const markdownToInsert = await handler(files)
      if (!markdownToInsert) return
      view.dispatch({
        changes: { from: at, insert: markdownToInsert },
        selection: { anchor: at + markdownToInsert.length },
      })
    } catch (err) {
      console.error('[canvasz] falha ao anexar arquivo', err)
    }
  }

  return <div className="cz-editor" ref={host} />
}
