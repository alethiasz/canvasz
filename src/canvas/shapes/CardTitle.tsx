import { useState } from 'react'
import { stopEventPropagation } from 'tldraw'
import { create } from 'zustand'
import { updateNode } from '../../api'
import { useNodesStore } from '../../nodes/store'
import { notificar } from '../../ui/toasts'

/**
 * Card recém-criado começa com o nome selecionado para digitar por cima.
 *
 * Sem isto, criar sempre produzia "Nova pasta" e exigia um segundo gesto para
 * renomear — e o resultado natural era uma pilha de itens todos chamados
 * "Nova pasta".
 */
const usePendenteDeNome = create<{ nodeId: string | null }>(() => ({ nodeId: null }))

export const nomearAoCriar = (nodeId: string) => usePendenteDeNome.setState({ nodeId })

/**
 * Título do card com renomear no lugar. Compartilhado pelos três tipos de card
 * para que pasta, nota e arquivo se comportem igual.
 */
export function CardTitle({
  nodeId,
  className,
  placeholder = 'Sem título',
}: {
  nodeId: string
  className: string
  placeholder?: string
}) {
  const node = useNodesStore((s) => s.byId[nodeId])
  const upsert = useNodesStore((s) => s.upsert)
  const pendente = usePendenteDeNome((s) => s.nodeId === nodeId)
  const [renaming, setRenaming] = useState(false)

  if (pendente && !renaming) {
    usePendenteDeNome.setState({ nodeId: null })
    setRenaming(true)
  }

  const title = node?.title.trim() || placeholder

  async function commit(value: string) {
    setRenaming(false)
    const next = value.trim()
    if (!node || next === node.title) return
    try {
      const { node: updated } = await updateNode(node.id, { title: next })
      upsert(updated)
    } catch (err) {
      notificar.erro('Não consegui renomear.', err)
    }
  }

  if (renaming) {
    return (
      <input
        className="cz-card__input"
        defaultValue={node?.title ?? ''}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        // O tldraw escuta o teclado globalmente (atalhos de ferramenta), então
        // cada tecla precisa parar aqui — senão digitar "d" troca para a caneta
        // no meio do nome.
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') void commit(e.currentTarget.value)
          if (e.key === 'Escape') setRenaming(false)
        }}
        onBlur={(e) => void commit(e.currentTarget.value)}
        onPointerDown={stopEventPropagation}
      />
    )
  }

  return (
    <span className={className} title={title}>
      {title}
      <button
        type="button"
        className="cz-card__rename"
        title="Renomear"
        onPointerDown={stopEventPropagation}
        onClick={(e) => {
          stopEventPropagation(e)
          setRenaming(true)
        }}
      >
        ✎
      </button>
    </span>
  )
}
