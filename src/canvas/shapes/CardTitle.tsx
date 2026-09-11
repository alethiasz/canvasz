import { useState } from 'react'
import { stopEventPropagation } from 'tldraw'
import { updateNode } from '../../api'
import { useNodesStore } from '../../nodes/store'

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
  const [renaming, setRenaming] = useState(false)

  const title = node?.title.trim() || placeholder

  async function commit(value: string) {
    setRenaming(false)
    const next = value.trim()
    if (!node || next === node.title) return
    try {
      const { node: updated } = await updateNode(node.id, { title: next })
      upsert(updated)
    } catch (err) {
      console.error('[canvasz] falha ao renomear', err)
    }
  }

  if (renaming) {
    return (
      <input
        className="cz-card__input"
        defaultValue={node?.title ?? ''}
        autoFocus
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
