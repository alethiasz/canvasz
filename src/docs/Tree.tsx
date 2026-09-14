import { useEffect, useState } from 'react'
import type { TreeNode } from '../api'
import { KIND_ICON, previewKind } from '../files'

const CHAVE = 'canvasz:pastas-abertas'

function lerAbertas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function gravarAbertas(abertas: Set<string>): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...abertas]))
  } catch {
    // Lembrar quais pastas estavam abertas é conveniência, não requisito.
  }
}

/** Caminho de pastas até o nó ativo, para abrir só o ramo que importa. */
function ancestraisDe(nodes: TreeNode[], alvo: string | undefined): string[] {
  if (!alvo) return []
  const caminho: string[] = []
  const buscar = (lista: TreeNode[], acumulado: string[]): boolean => {
    for (const node of lista) {
      if (node.id === alvo) {
        caminho.push(...acumulado)
        return true
      }
      if (node.children.length > 0 && buscar(node.children, [...acumulado, node.id])) return true
    }
    return false
  }
  buscar(nodes, [])
  return caminho
}

function icone(node: TreeNode): string {
  if (node.kind === 'folder') return '📁'
  if (node.kind === 'note') return '📄'
  return KIND_ICON[previewKind(node.mime)]
}

function Ramo({
  nodes,
  activeId,
  abertas,
  alternar,
  onOpen,
  onMove,
  nivel,
}: {
  nodes: TreeNode[]
  activeId: string | undefined
  abertas: Set<string>
  alternar: (id: string) => void
  onOpen: (node: TreeNode) => void
  onMove: (nodeId: string, parent: string) => void
  nivel: number
}) {
  const [alvoDeSolta, setAlvoDeSolta] = useState<string | null>(null)

  return (
    <ul className="cz-tree">
      {nodes.map((node) => {
        const ehPasta = node.kind === 'folder'
        const aberta = abertas.has(node.id)
        const temFilhos = node.children.length > 0

        return (
          <li key={node.id}>
            <div
              className={[
                'cz-tree__linha',
                node.id === activeId ? 'cz-tree__linha--ativa' : '',
                alvoDeSolta === node.id ? 'cz-tree__linha--solta' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: 8 + nivel * 14 }}
            >
              {/* A seta é um controle à parte: abrir a pasta e ir para o canvas
                  dela são ações diferentes e não podem competir pelo clique. */}
              <button
                type="button"
                className={`cz-tree__seta${temFilhos ? '' : ' cz-tree__seta--vazia'}`}
                aria-label={aberta ? `Recolher ${node.title}` : `Expandir ${node.title}`}
                aria-expanded={temFilhos ? aberta : undefined}
                disabled={!temFilhos}
                onClick={() => temFilhos && alternar(node.id)}
              >
                {temFilhos ? (aberta ? '▾' : '▸') : ''}
              </button>

              <button
                type="button"
                className="cz-tree__item"
                onClick={() => onOpen(node)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/canvasz-node', node.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                // Só pasta recebe: soltar sobre uma nota não significa nada.
                onDragOver={(e) => {
                  if (!ehPasta || !e.dataTransfer.types.includes('text/canvasz-node')) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setAlvoDeSolta(node.id)
                }}
                onDragLeave={() => setAlvoDeSolta((t) => (t === node.id ? null : t))}
                onDrop={(e) => {
                  setAlvoDeSolta(null)
                  if (!ehPasta) return
                  e.preventDefault()
                  e.stopPropagation()
                  const arrastado = e.dataTransfer.getData('text/canvasz-node')
                  if (arrastado && arrastado !== node.id) onMove(arrastado, node.id)
                }}
              >
                <span className="cz-tree__icone" aria-hidden="true">
                  {icone(node)}
                </span>
                <span className="cz-tree__rotulo">{node.title.trim() || 'Sem título'}</span>
                {ehPasta && temFilhos && !aberta && (
                  <span className="cz-tree__contagem">{node.children.length}</span>
                )}
              </button>
            </div>

            {temFilhos && aberta && (
              <Ramo
                nodes={node.children}
                activeId={activeId}
                abertas={abertas}
                alternar={alternar}
                onOpen={onOpen}
                onMove={onMove}
                nivel={nivel + 1}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Árvore com pastas recolhíveis.
 *
 * Antes tudo ficava sempre aberto: com algumas dezenas de notas a barra
 * lateral virava uma parede rolável em que nada se achava. Agora as pastas
 * começam fechadas, o ramo do documento aberto se abre sozinho, e o que você
 * abrir fica lembrado.
 */
export function Tree({
  nodes,
  activeId,
  onOpen,
  onMove,
}: {
  nodes: TreeNode[]
  activeId: string | undefined
  onOpen: (node: TreeNode) => void
  onMove: (nodeId: string, parent: string) => void
}) {
  const [abertas, setAbertas] = useState<Set<string>>(() => lerAbertas())

  // Abrir um documento revela onde ele mora.
  useEffect(() => {
    const caminho = ancestraisDe(nodes, activeId)
    if (caminho.length === 0) return
    setAbertas((atuais) => {
      if (caminho.every((id) => atuais.has(id))) return atuais
      const proximas = new Set(atuais)
      for (const id of caminho) proximas.add(id)
      gravarAbertas(proximas)
      return proximas
    })
  }, [nodes, activeId])

  function alternar(id: string) {
    setAbertas((atuais) => {
      const proximas = new Set(atuais)
      if (!proximas.delete(id)) proximas.add(id)
      gravarAbertas(proximas)
      return proximas
    })
  }

  return (
    <Ramo
      nodes={nodes}
      activeId={activeId}
      abertas={abertas}
      alternar={alternar}
      onOpen={onOpen}
      onMove={onMove}
      nivel={0}
    />
  )
}
