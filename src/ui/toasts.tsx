import { useEffect } from 'react'
import { create } from 'zustand'

export type Toast = {
  id: number
  tipo: 'erro' | 'aviso' | 'ok'
  texto: string
}

type ToastState = {
  itens: Toast[]
  empilhar: (tipo: Toast['tipo'], texto: string) => void
  dispensar: (id: number) => void
}

const DURACAO = { erro: 8000, aviso: 6000, ok: 3000 }

let proximoId = 1

export const useToasts = create<ToastState>((set) => ({
  itens: [],
  empilhar: (tipo, texto) => {
    const id = proximoId++
    set((s) => {
      // Repetir a mesma mensagem em sequência só faz barulho.
      if (s.itens.some((t) => t.texto === texto && t.tipo === tipo)) return s
      return { itens: [...s.itens, { id, tipo, texto }] }
    })
    setTimeout(() => set((s) => ({ itens: s.itens.filter((t) => t.id !== id) })), DURACAO[tipo])
  },
  dispensar: (id) => set((s) => ({ itens: s.itens.filter((t) => t.id !== id) })),
}))

/**
 * Avisar o usuário quando algo falha.
 *
 * Antes disto, todo erro ia só para o console: o upload não acontecia, a pasta
 * não era movida, a nota não salvava — e a interface ficava calada, como se
 * tudo tivesse dado certo. Silêncio é o pior retorno possível.
 */
export const notificar = {
  erro: (texto: string, causa?: unknown) => {
    if (causa) console.error(`[canvasz] ${texto}`, causa)
    useToasts.getState().empilhar('erro', texto)
  },
  aviso: (texto: string) => useToasts.getState().empilhar('aviso', texto),
  ok: (texto: string) => useToasts.getState().empilhar('ok', texto),
}

const ICONE: Record<Toast['tipo'], string> = { erro: '⚠', aviso: '!', ok: '✓' }

export function Toasts() {
  const itens = useToasts((s) => s.itens)
  const dispensar = useToasts((s) => s.dispensar)

  // Esc limpa a pilha: um erro persistente não pode ficar tampando a tela.
  useEffect(() => {
    if (itens.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useToasts.setState({ itens: [] })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [itens.length])

  if (itens.length === 0) return null

  return (
    <div className="cz-toasts" role="status" aria-live="polite">
      {itens.map((toast) => (
        <div key={toast.id} className={`cz-toast cz-toast--${toast.tipo}`}>
          <span className="cz-toast__icone" aria-hidden="true">
            {ICONE[toast.tipo]}
          </span>
          <span className="cz-toast__texto">{toast.texto}</span>
          <button
            type="button"
            className="cz-toast__fechar"
            aria-label="Dispensar aviso"
            onClick={() => dispensar(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
