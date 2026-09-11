import { db } from './db.ts'

export type NodeRow = {
  id: string
  parent_id: string | null
  kind: 'folder' | 'note' | 'file'
  title: string
  created_at: number
  updated_at: number
  child_count: number
  /** Começo do markdown, para o card da nota no canvas. Só para `kind: 'note'`. */
  preview: string | null
  /** Só para `kind: 'file'`. */
  mime: string | null
  size: number | null
}

/**
 * A forma canônica de um nó para a interface. Existe num módulo só porque
 * duplicar esta lista já custou caro: uma cópia sem `mime` fez o card do
 * arquivo virar ícone genérico e o anexo de imagem virar link.
 */
export const NODE_COLUMNS = `
  n.id, n.parent_id, n.kind, n.title, n.created_at, n.updated_at,
  (SELECT COUNT(*) FROM nodes c WHERE c.parent_id = n.id AND c.deleted_at IS NULL) AS child_count,
  (SELECT substr(markdown, 1, 240) FROM notes WHERE node_id = n.id) AS preview,
  (SELECT mime FROM files WHERE node_id = n.id) AS mime,
  (SELECT size FROM files WHERE node_id = n.id) AS size
`

export const selectNodeById = db.prepare<[string], NodeRow>(
  `SELECT ${NODE_COLUMNS} FROM nodes n WHERE n.id = ? AND n.deleted_at IS NULL`,
)
