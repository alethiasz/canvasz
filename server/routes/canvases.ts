import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db.ts'

export const ROOT_CANVAS = '__root__'

const putBody = z.object({ snapshot: z.unknown() })

const selectCanvas = db.prepare<[string], { snapshot: string }>(
  'SELECT snapshot FROM canvases WHERE node_id = ?',
)
const upsertCanvas = db.prepare(
  `INSERT INTO canvases (node_id, snapshot, updated_at) VALUES (?, ?, ?)
   ON CONFLICT (node_id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
)
const selectFolder = db.prepare<[string], { id: string }>(
  `SELECT id FROM nodes WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL`,
)

/** Um canvas existe para a raiz e para cada pasta viva. */
function isValidCanvasId(id: string): boolean {
  return id === ROOT_CANVAS || selectFolder.get(id) !== undefined
}

export const canvases = new Hono()

canvases.get('/:id', (c) => {
  const id = c.req.param('id')
  if (!isValidCanvasId(id)) return c.json({ error: 'canvas inexistente' }, 404)

  const row = selectCanvas.get(id)
  // Canvas nunca salvo é um canvas vazio, não um erro.
  return c.json({ snapshot: row ? JSON.parse(row.snapshot) : null })
})

canvases.put('/:id', async (c) => {
  const id = c.req.param('id')
  if (!isValidCanvasId(id)) return c.json({ error: 'canvas inexistente' }, 404)

  const parsed = putBody.safeParse(await c.req.json())
  if (!parsed.success) return c.json({ error: 'corpo inválido' }, 400)

  upsertCanvas.run(id, JSON.stringify(parsed.data.snapshot), Date.now())
  return c.json({ ok: true })
})
