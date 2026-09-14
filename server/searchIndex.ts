import { db } from './db.ts'

const deleteRow = db.prepare('DELETE FROM node_fts WHERE node_id = ?')
const insertRow = db.prepare('INSERT INTO node_fts (node_id, title, body) VALUES (?, ?, ?)')

/** O corpo indexável de um nó: markdown para notas, texto extraído para arquivos. */
const selectIndexable = db.prepare<[string], { title: string; body: string | null }>(`
  SELECT n.title,
         COALESCE(nt.markdown, f.extracted_text) AS body
  FROM nodes n
  LEFT JOIN notes nt ON nt.node_id = n.id
  LEFT JOIN files f  ON f.node_id = n.id
  WHERE n.id = ? AND n.deleted_at IS NULL
`)

/** Ao apagar uma pasta, a subárvore inteira sai do índice junto. */
const selectSubtree = db.prepare<[string], { id: string }>(`
  WITH RECURSIVE sub(id) AS (
    SELECT id FROM nodes WHERE id = ?
    UNION ALL
    SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
  )
  SELECT id FROM sub
`)

/** Reindexa um nó. Nó apagado simplesmente sai do índice. */
export function indexNode(id: string): void {
  deleteRow.run(id)
  const row = selectIndexable.get(id)
  if (row) insertRow.run(id, row.title, row.body ?? '')
}

export function indexSubtree(id: string): void {
  db.transaction(() => {
    for (const { id: nodeId } of selectSubtree.all(id)) indexNode(nodeId)
  })()
}

export type SearchHit = {
  node_id: string
  kind: 'folder' | 'note' | 'file'
  title: string
  parent_id: string | null
  /** Nome da pasta onde o item está — dois resultados homônimos precisam
   *  ser distinguíveis na lista. */
  parent_title: string | null
  excerpt: string
}

/**
 * O que o usuário digita não é sintaxe FTS: aspas, `*`, `AND`, `NEAR` e afins
 * fariam a consulta explodir. Cada palavra vira um termo entre aspas com
 * prefixo, que é o comportamento esperado de uma busca incremental.
 */
function toMatchQuery(raw: string): string | null {
  const terms = raw
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter((t) => t.length > 0)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"*`).join(' ')
}

const searchStmt = db.prepare<[string, number], SearchHit>(`
  SELECT f.node_id,
         n.kind,
         n.title,
         n.parent_id,
         (SELECT title FROM nodes p WHERE p.id = n.parent_id) AS parent_title,
         snippet(node_fts, 2, '«', '»', '…', 14) AS excerpt
  FROM node_fts f
  JOIN nodes n ON n.id = f.node_id
  WHERE node_fts MATCH ? AND n.deleted_at IS NULL
  ORDER BY bm25(node_fts, 10.0, 1.0) 
  LIMIT ?
`)

export function searchNodes(query: string, limit = 30): SearchHit[] {
  const match = toMatchQuery(query)
  if (!match) return []
  try {
    return searchStmt.all(match, limit)
  } catch (err) {
    // Consulta que o FTS recusa não deve derrubar a busca inteira.
    console.warn('[canvasz] consulta de busca inválida', err)
    return []
  }
}
