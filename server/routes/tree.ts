import { Hono } from 'hono'
import { db } from '../db.ts'

type FlatRow = {
  id: string
  parent_id: string | null
  kind: 'folder' | 'note' | 'file'
  title: string
  updated_at: number
  /** Só para arquivos: deixa a árvore usar o mesmo ícone do card no canvas. */
  mime: string | null
}

export type TreeNode = FlatRow & { children: TreeNode[] }

/** Árvore viva inteira, das raízes para baixo. */
const selectAll = db.prepare<[], FlatRow>(`
  WITH RECURSIVE walk(id, parent_id, kind, title, updated_at, depth) AS (
    SELECT id, parent_id, kind, title, updated_at, 0
    FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL
    UNION ALL
    SELECT n.id, n.parent_id, n.kind, n.title, n.updated_at, walk.depth + 1
    FROM nodes n JOIN walk ON n.parent_id = walk.id
    WHERE n.deleted_at IS NULL
  )
  -- Pastas primeiro, depois notas, depois arquivos: a ordem que todo
  -- explorador de arquivos usa e que o usuário já espera.
  SELECT w.id, w.parent_id, w.kind, w.title, w.updated_at,
         (SELECT mime FROM files WHERE node_id = w.id) AS mime
  FROM walk w
  ORDER BY w.depth,
           CASE w.kind WHEN 'folder' THEN 0 WHEN 'note' THEN 1 ELSE 2 END,
           w.title COLLATE NOCASE
`)

export const tree = new Hono()

tree.get('/', (c) => {
  const rows = selectAll.all()
  const byId = new Map<string, TreeNode>(rows.map((r) => [r.id, { ...r, children: [] }]))

  const roots: TreeNode[] = []
  for (const row of rows) {
    const node = byId.get(row.id)!
    // A consulta vem ordenada por profundidade, então o pai já está no mapa.
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return c.json({ tree: roots })
})
