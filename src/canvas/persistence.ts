import { useEffect } from 'react'
import { getSnapshot, type Editor, type TLSessionStateSnapshot } from 'tldraw'
import { putCanvas } from '../api'
import { marcarErro, marcarSalvando, marcarSalvo } from '../ui/saveStatus'
import { notificar } from '../ui/toasts'

const SAVE_DEBOUNCE_MS = 500

const sessionKey = (canvasId: string) => `canvasz:session:${canvasId}`

/**
 * A sessão (câmera, seleção) é por navegador, não por documento — fica no
 * localStorage para que voltar a uma pasta restaure o enquadramento sem
 * poluir o snapshot compartilhado.
 */
export function loadSession(canvasId: string): TLSessionStateSnapshot | undefined {
  try {
    const raw = localStorage.getItem(sessionKey(canvasId))
    return raw ? (JSON.parse(raw) as TLSessionStateSnapshot) : undefined
  } catch {
    return undefined
  }
}

export function useCanvasPersistence(editor: Editor | null, canvasId: string): void {
  useEffect(() => {
    if (!editor) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false

    const flush = async () => {
      timer = undefined
      marcarSalvando()
      const { document, session } = getSnapshot(editor.store)
      try {
        localStorage.setItem(sessionKey(canvasId), JSON.stringify(session))
      } catch {
        // localStorage cheio ou bloqueado: perder a câmera é aceitável.
      }
      try {
        await putCanvas(canvasId, document)
        marcarSalvo()
      } catch (err) {
        // Perder desenho em silêncio é o pior desfecho possível deste app.
        marcarErro()
        notificar.erro('Não consegui salvar o canvas. Sua última alteração pode se perder.', err)
      }
    }

    const schedule = () => {
      if (disposed) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    }

    const unlistenDocument = editor.store.listen(schedule, { scope: 'document', source: 'user' })
    const unlistenSession = editor.store.listen(schedule, { scope: 'session', source: 'user' })

    // Fechar a aba não pode custar os últimos 500 ms de trabalho.
    const flushNow = () => {
      if (!timer) return
      clearTimeout(timer)
      void flush()
    }
    window.addEventListener('beforeunload', flushNow)

    return () => {
      disposed = true
      window.removeEventListener('beforeunload', flushNow)
      unlistenDocument()
      unlistenSession()
      flushNow()
    }
  }, [editor, canvasId])
}
