import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db.ts'
import { NODE_COLUMNS, selectNodeById, type NodeRow } from '../nodeQueries.ts'
import { indexNode, indexSubtree } from '../searchIndex.ts'

export const ROOT_CANVAS = '__root__'

export type { NodeRow }

const selectRootChildren = db.prepare<[], NodeRow>(
  `SELECT ${NODE_COLUMNS} FROM nodes n
   WHERE n.parent_id IS NULL AND n.deleted_at IS NULL ORDER BY n.created_at`,
)
const selectChildren = db.prepare<[string], NodeRow>(
  `SELECT ${NODE_COLUMNS} FROM nodes n
   WHERE n.parent_id = ? AND n.deleted_at IS NULL ORDER BY n.created_at`,
)
const selectAnyNode = db.prepare<[string], { id: string; kind: string; deleted_at: number | null }>(
  'SELECT id, kind, deleted_at FROM nodes WHERE id = ?',
)
const selectLiveFolder = db.prepare<[string], { id: string }>(
  `SELECT id FROM nodes WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL`,
)

const insertNode = db.prepare(
  'INSERT INTO nodes (id, parent_id, kind, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
)
const insertNoteBody = db.prepare('INSERT INTO notes (node_id, markdown) VALUES (?, ?)')

/** Uma nota é sempre um nó mais um corpo: as duas linhas nascem juntas. */
const createNode = db.transaction(
  (id: string, parentId: string | null, kind: 'folder' | 'note', title: string, now: number) => {
    insertNode.run(id, parentId, kind, title, now, now)
    if (kind === 'note') insertNoteBody.run(id, '')
  },
)
const updateTitle = db.prepare('UPDATE nodes SET title = ?, updated_at = ? WHERE id = ?')
const updateParent = db.prepare('UPDATE nodes SET parent_id = ?, updated_at = ? WHERE id = ?')

/** Apagar uma pasta manda a subárvore inteira para a lixeira, não só a pasta. */
const softDeleteSubtree = db.prepare(`
  WITH RECURSIVE sub(id) AS (
    SELECT id FROM nodes WHERE id = ?
    UNION ALL
    SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
  )
  UPDATE nodes SET deleted_at = ?, updated_at = ?
  WHERE id IN (SELECT id FROM sub) AND deleted_at IS NULL
`)

/** Desfazer um apagamento restaura a mesma subárvore. */
const restoreSubtree = db.prepare(`
  WITH RECURSIVE sub(id) AS (
    SELECT id FROM nodes WHERE id = ?
    UNION ALL
    SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
  )
  UPDATE nodes SET deleted_at = NULL, updated_at = ?
  WHERE id IN (SELECT id FROM sub)
`)

/** Ancestrais do nó, da raiz até ele — a trilha de navegação. */
const selectPath = db.prepare<[string], { id: string; title: string; kind: string; depth: number }>(`
  WITH RECURSIVE up(id, parent_id, title, kind, depth) AS (
    SELECT id, parent_id, title, kind, 0 FROM nodes WHERE id = ?
    UNION ALL
    SELECT n.id, n.parent_id, n.title, n.kind, up.depth + 1
    FROM nodes n JOIN up ON n.id = up.parent_id
  )
  SELECT id, title, kind, depth FROM up ORDER BY depth DESC
`)

/** Um id de canvas é a raiz ou uma pasta viva. */
function canvasParentId(canvasId: string): string | null | undefined {
  if (canvasId === ROOT_CANVAS) return null
  return selectLiveFolder.get(canvasId) ? canvasId : undefined
}

/** Mover uma pasta para dentro de si mesma quebraria a árvore. */
function isDescendantOf(candidate: string, ancestor: string): boolean {
  let current: string | null = candidate
  const seen = new Set<string>()
  while (current) {
    if (current === ancestor) return true
    if (seen.has(current)) return false
    seen.add(current)
    const row: { parent_id: string | null } | undefined = db
      .prepare<[string], { parent_id: string | null }>('SELECT parent_id FROM nodes WHERE id = ?')
      .get(current)
    current = row?.parent_id ?? null
  }
  return false
}

export const nodes = new Hono()

nodes.get('/', (c) => {
  const canvasId = c.req.query('parent') ?? ROOT_CANVAS
  const parentId = canvasParentId(canvasId)
  if (parentId === undefined) return c.json({ error: 'canvas inexistente' }, 404)

  return c.json({ nodes: parentId === null ? selectRootChildren.all() : selectChildren.all(parentId) })
})

const createBody = z.object({
  parent: z.string().default(ROOT_CANVAS),
  // Arquivos entram na próxima fase.
  kind: z.enum(['folder', 'note']),
  title: z.string().max(200).default(''),
})

nodes.post('/', async (c) => {
  const parsed = createBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: 'corpo inválido', detail: parsed.error.issues }, 400)

  const parentId = canvasParentId(parsed.data.parent)
  if (parentId === undefined) return c.json({ error: 'pasta pai inexistente' }, 404)

  const id = nanoid(12)
  const now = Date.now()
  createNode(id, parentId, parsed.data.kind, parsed.data.title, now)
  indexNode(id)
  return c.json({ node: selectNodeById.get(id) }, 201)
})

const patchBody = z.object({
  title: z.string().max(200).optional(),
  parent: z.string().optional(),
  restore: z.literal(true).optional(),
})

nodes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const existing = selectAnyNode.get(id)
  if (!existing) return c.json({ error: 'nó inexistente' }, 404)

  const parsed = patchBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return c.json({ error: 'corpo inválido', detail: parsed.error.issues }, 400)
  const { title, parent, restore } = parsed.data
  const now = Date.now()

  if (restore) {
    restoreSubtree.run(id, now)
    indexSubtree(id)
  }
  if (title !== undefined) {
    updateTitle.run(title, now, id)
    indexNode(id)
  }

  if (parent !== undefined) {
    const parentId = canvasParentId(parent)
    if (parentId === undefined) return c.json({ error: 'pasta destino inexistente' }, 404)
    if (parentId !== null && (parentId === id || isDescendantOf(parentId, id))) {
      return c.json({ error: 'não dá para mover uma pasta para dentro dela mesma' }, 409)
    }
    updateParent.run(parentId, now, id)
  }

  return c.json({ node: selectNodeById.get(id) })
})

nodes.delete('/:id', (c) => {
  const id = c.req.param('id')
  if (!selectAnyNode.get(id)) return c.json({ error: 'nó inexistente' }, 404)

  const now = Date.now()
  softDeleteSubtree.run(id, now, now)
  // Os nós somem do índice junto: buscar não pode devolver coisa na lixeira.
  indexSubtree(id)
  return c.json({ ok: true })
})

nodes.get('/:id/path', (c) => {
  const id = c.req.param('id')
  if (!selectNodeById.get(id)) return c.json({ error: 'nó inexistente' }, 404)
  return c.json({ path: selectPath.all(id).map(({ id: nodeId, title, kind }) => ({ id: nodeId, title, kind })) })
})
